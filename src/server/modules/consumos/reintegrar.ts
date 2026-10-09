import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { type DestinoReintegro, planificarReintegro } from "@/domain/consumos/consumibles";
import { creditosPedido } from "@/domain/consumos/debito";
import { FAMILIAS_CONSUMO, type FamiliaConsumo } from "@/domain/consumos/familias";
import { exito, type Resultado, rechazo } from "@/domain/resultado";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { bloquearEmpresa, esBloqueoOcupado } from "./consumir";

export interface PedidoReintegro {
  sistema: string;
  empresaNumero: number;
  familia: FamiliaConsumo;
  /** Unidades que no se usaron (mensajes o presupuestos), antes del factor. */
  cantidad: number;
  /** Identificador de este reintegro (idempotencia). */
  transaccion: string;
  /** La solicitud que se revierte. */
  transaccionOrigen: string;
  espera?: "ESPERAR" | "NO_ESPERAR" | undefined;
}

export interface ResultadoReintegro {
  transaccion: string;
  transaccionOrigen: string;
  cantidad: number;
  /** Créditos devueltos: cantidad × el factor de la solicitud, hacia arriba. */
  creditos: number;
  repetido: boolean;
}

export type RechazoReintegro =
  | "EMPRESA_INEXISTENTE"
  | "ORIGEN_INEXISTENTE"
  | "TRANSACCION_DUPLICADA"
  | "REINTEGRO_EXCEDE"
  | "EN_CURSO_REINTENTAR";

/**
 * Devuelve unidades de una solicitud que no se usaron.
 * Solo lo entregado y no reintegrado antes; con el factor de la solicitud.
 * Va primero a los consumibles del alcance, del más nuevo al más viejo, y lo
 * que no entra vuelve a los contratos de los que salió. Idempotente por
 * (sistema, transacción) y con el mismo bloqueo que los consumos.
 */
export async function reintegrar(
  db: Db,
  pedido: PedidoReintegro,
): Promise<Resultado<ResultadoReintegro, RechazoReintegro>> {
  try {
    return await db.transaction(async (tx) => {
      const empresa = await bloquearEmpresa(
        tx,
        eq(t.empresas.numero, pedido.empresaNumero),
        pedido.espera ?? "ESPERAR",
      );
      if (!empresa) return rechazo("EMPRESA_INEXISTENTE");

      const previo = await tx.query.consumos.findFirst({
        where: and(
          eq(t.consumos.sistema, pedido.sistema),
          eq(t.consumos.transaccionExterna, pedido.transaccion),
        ),
      });
      if (previo) {
        if (previo.tipo !== "REINTEGRO" || previo.empresaId !== empresa.id) {
          return rechazo("TRANSACCION_DUPLICADA");
        }
        return exito({
          transaccion: pedido.transaccion,
          transaccionOrigen: pedido.transaccionOrigen,
          cantidad: previo.cantidad,
          creditos: previo.creditosConsumidos,
          repetido: true,
        });
      }

      const origen = await tx.query.consumos.findFirst({
        where: and(
          eq(t.consumos.sistema, pedido.sistema),
          eq(t.consumos.transaccionExterna, pedido.transaccionOrigen),
          eq(t.consumos.tipo, "SOLICITUD"),
          eq(t.consumos.empresaId, empresa.id),
          eq(t.consumos.familia, pedido.familia),
        ),
      });
      if (!origen) return rechazo("ORIGEN_INEXISTENTE");

      const creditos = creditosPedido(pedido.cantidad, origen.factorCentesimos);
      const anteriores = await tx
        .select({ id: t.consumos.id, creditos: t.consumos.creditosConsumidos })
        .from(t.consumos)
        .where(eq(t.consumos.consumoOrigenId, origen.id));
      const yaDevuelto = anteriores.reduce((s, r) => s + r.creditos, 0);
      if (creditos + yaDevuelto > origen.creditosConsumidos) return rechazo("REINTEGRO_EXCEDE");

      const familia = FAMILIAS_CONSUMO[pedido.familia];
      // Consumibles del mismo alcance (empresa u oficina), del más nuevo al más viejo.
      const destinos = await tx
        .select({
          contratoId: t.contratos.id,
          cantidad: t.contratoRecursos.cantidad,
          saldo: t.contratoRecursos.saldo,
        })
        .from(t.contratos)
        .innerJoin(t.contratoRecursos, eq(t.contratoRecursos.contratoId, t.contratos.id))
        .where(
          and(
            eq(t.contratos.empresaId, empresa.id),
            origen.oficinaId
              ? eq(t.contratos.oficinaId, origen.oficinaId)
              : isNull(t.contratos.oficinaId),
            inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
            eq(t.contratoRecursos.recursoId, familia.saldo),
          ),
        )
        .orderBy(desc(t.contratos.creadoEn));

      // De dónde salió la solicitud, en orden inverso, menos lo ya devuelto a cada uno.
      const salidas = await tx
        .select({
          contratoId: t.movimientosSaldo.contratoId,
          clase: t.movimientosSaldo.clase,
          periodo: t.movimientosSaldo.periodo,
          creditos: t.movimientosSaldo.creditos,
        })
        .from(t.movimientosSaldo)
        .where(
          and(eq(t.movimientosSaldo.consumoId, origen.id), eq(t.movimientosSaldo.tipo, "CONSUMO")),
        )
        .orderBy(desc(t.movimientosSaldo.id));
      const devueltos = anteriores.length
        ? await tx
            .select({
              contratoId: t.movimientosSaldo.contratoId,
              clase: t.movimientosSaldo.clase,
              creditos: sql<number>`sum(${t.movimientosSaldo.creditos})::int`,
            })
            .from(t.movimientosSaldo)
            .where(
              inArray(
                t.movimientosSaldo.consumoId,
                anteriores.map((a) => a.id),
              ),
            )
            .groupBy(t.movimientosSaldo.contratoId, t.movimientosSaldo.clase)
        : [];
      const devueltoA = (contratoId: string, clase: string) =>
        Number(
          devueltos.find((d) => d.contratoId === contratoId && d.clase === clase)?.creditos ?? 0,
        );

      const plan = planificarReintegro(
        creditos,
        destinos.map(
          (d): DestinoReintegro => ({
            contratoId: d.contratoId,
            tipo: "SALDO",
            capacidad: d.cantidad - Number(d.saldo),
          }),
        ),
        salidas.map(
          (s): DestinoReintegro => ({
            contratoId: s.contratoId,
            tipo: s.clase === "CUPO_MENSUAL" ? "CUPO_MENSUAL" : "SALDO",
            capacidad: -s.creditos - devueltoA(s.contratoId, s.clase),
          }),
        ),
      );
      if (!plan) return rechazo("REINTEGRO_EXCEDE");

      const [reintegro] = await tx
        .insert(t.consumos)
        .values({
          empresaId: empresa.id,
          oficinaId: origen.oficinaId,
          familia: pedido.familia,
          sistema: pedido.sistema,
          transaccionExterna: pedido.transaccion,
          medioEnvioId: origen.medioEnvioId,
          cantidad: pedido.cantidad,
          factorCentesimos: origen.factorCentesimos,
          creditosSolicitados: creditos,
          creditosConsumidos: creditos,
          concepto: `Reintegro de ${pedido.transaccionOrigen}`.slice(0, 200),
          tipo: "REINTEGRO",
          consumoOrigenId: origen.id,
        })
        .returning({ id: t.consumos.id });
      if (plan.length) {
        await tx.insert(t.movimientosSaldo).values(
          plan.map((a) => ({
            contratoId: a.contratoId,
            recursoId: a.tipo === "CUPO_MENSUAL" ? familia.cupoMensual : familia.saldo,
            clase: a.tipo,
            tipo: "REINTEGRO" as const,
            creditos: a.creditos,
            // El cupo vuelve al mes en que se consumió.
            periodo:
              a.tipo === "CUPO_MENSUAL"
                ? (salidas.find((s) => s.contratoId === a.contratoId && s.periodo)?.periodo ?? null)
                : null,
            consumoId: reintegro?.id ?? null,
            observacion: `Reintegro de ${pedido.transaccionOrigen}`.slice(0, 200),
          })),
        );
      }
      return exito({
        transaccion: pedido.transaccion,
        transaccionOrigen: pedido.transaccionOrigen,
        cantidad: pedido.cantidad,
        creditos,
        repetido: false,
      });
    });
  } catch (error) {
    if (esBloqueoOcupado(error)) return rechazo("EN_CURSO_REINTENTAR");
    throw error;
  }
}
