import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { type FuenteSaldo, planificarDebito } from "@/domain/consumos/debito";
import {
  FAMILIAS_CONSUMO,
  type FamiliaConsumo,
  partesCodigoOficina,
} from "@/domain/consumos/familias";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { estaVigente } from "@/domain/licencias/contrato";
import { exito, type Resultado, rechazo } from "@/domain/resultado";
import type { Db, Ejecutor, Tx } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { POLITICAS_POR_DEFECTO } from "@/server/db/schema/configuracion";

export interface PedidoConsumo {
  sistema: string;
  empresaNumero: number;
  familia: FamiliaConsumo;
  cantidad: number;
  /** Medio de envío (notificaciones): "mail", "sms", "whatsapp", "app". */
  medio?: string | undefined;
  /** Oficina que consume, "CCOOO". Sin oficina: consumo de la empresa. */
  oficina?: string | undefined;
  modo: "TODO_O_NADA" | "PARCIAL";
  /** Identificador de la operación en el sistema que consume (idempotencia). */
  transaccion: string;
  concepto?: string | undefined;
}

export interface ResultadoConsumo {
  transaccion: string;
  solicitado: number;
  consumido: number;
  factor: number;
  completo: boolean;
  /**
   * Créditos que quedan para esta oficina/empresa después del consumo.
   * `null` en un reintento: se devuelve el resultado original, no se recalcula.
   */
  disponible: number | null;
  /** true si la transacción ya se había procesado (reintento del producto). */
  repetido: boolean;
}

export type RechazoConsumo =
  | "EMPRESA_INEXISTENTE"
  | "EMPRESA_INACTIVA"
  | "OFICINA_INEXISTENTE"
  | "OFICINA_SIN_PERMISO"
  | "MEDIO_INVALIDO";

/** Inicio del mes en Argentina (UTC−3, sin horario de verano) como instante. */
const inicioDeMesArgentina = (hoy: Fecha) => new Date(`${hoy.slice(0, 7)}-01T03:00:00Z`);

interface FuenteConRecurso extends FuenteSaldo {
  recursoId: string;
}

/**
 * Fuentes de crédito de la empresa para una familia: cada contrato vigente
 * con cupo del mes o saldo prepago, y lo que tiene disponible hoy.
 */
async function fuentesDeCredito(
  tx: Ejecutor,
  empresaId: string,
  familia: FamiliaConsumo,
  hoy: Fecha,
): Promise<FuenteConRecurso[]> {
  const { cupoMensual, saldo } = FAMILIAS_CONSUMO[familia];
  const filas = await tx
    .select({
      contratoId: t.contratos.id,
      oficinaId: t.contratos.oficinaId,
      estado: t.contratos.estado,
      tipoPaquete: t.contratos.tipoPaquete,
      desde: t.contratos.desde,
      hasta: t.contratos.hasta,
      pendPagoActivoHasta: t.contratos.pendPagoActivoHasta,
      prorrogaHasta: t.contratos.prorrogaHasta,
      recursoId: t.contratoRecursos.recursoId,
      clase: t.contratoRecursos.clase,
      cantidad: t.contratoRecursos.cantidad,
      consumidoMes: sql<number>`coalesce((select -sum(m.creditos) from ${t.movimientosSaldo} m where m.contrato_id = ${t.contratos.id} and m.recurso_id = ${t.contratoRecursos.recursoId} and m.periodo = ${hoy.slice(0, 7)}), 0)::int`,
      // El saldo prepago lo mantiene un trigger: no se suma el historial.
      saldo: t.contratoRecursos.saldo,
    })
    .from(t.contratos)
    .innerJoin(t.contratoRecursos, eq(t.contratoRecursos.contratoId, t.contratos.id))
    .where(
      and(
        eq(t.contratos.empresaId, empresaId),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        inArray(t.contratoRecursos.recursoId, [cupoMensual, saldo]),
      ),
    );

  return filas
    .map((f) => {
      const disponible =
        f.clase === "CUPO_MENSUAL"
          ? Math.max(f.cantidad - Number(f.consumidoMes), 0)
          : Number(f.saldo);
      return { ...f, disponible };
    })
    .filter((f) =>
      estaVigente({ ...f, saldoRestante: f.clase === "SALDO" ? f.disponible : undefined }, hoy),
    )
    .map((f) => ({
      contratoId: f.contratoId,
      recursoId: f.recursoId,
      oficinaId: f.oficinaId,
      tipo: f.clase === "CUPO_MENSUAL" ? ("CUPO_MENSUAL" as const) : ("SALDO" as const),
      disponible: f.disponible,
      desde: f.desde ?? hoy,
    }));
}

/**
 * Registra un consumo informado por un producto. Serializa por empresa
 * (bloquea su fila) para que dos consumos simultáneos no dejen saldo
 * negativo, y es idempotente por (sistema, transacción).
 */
export async function consumir(
  db: Db | Tx,
  pedido: PedidoConsumo,
  hoy: Fecha = hoyArgentina(),
): Promise<Resultado<ResultadoConsumo, RechazoConsumo>> {
  return db.transaction(async (tx) => {
    const [empresa] = await tx
      .select({ id: t.empresas.id, activa: t.empresas.activa })
      .from(t.empresas)
      .where(eq(t.empresas.numero, pedido.empresaNumero))
      .for("update");
    if (!empresa) return rechazo("EMPRESA_INEXISTENTE");

    const previo = await tx.query.consumos.findFirst({
      where: and(
        eq(t.consumos.sistema, pedido.sistema),
        eq(t.consumos.transaccionExterna, pedido.transaccion),
      ),
    });
    if (previo) {
      return exito({
        transaccion: pedido.transaccion,
        solicitado: previo.creditosSolicitados,
        consumido: previo.creditosConsumidos,
        factor: previo.factorCentesimos / 100,
        completo: previo.creditosConsumidos === previo.creditosSolicitados,
        disponible: null,
        repetido: true,
      });
    }
    if (!empresa.activa) return rechazo("EMPRESA_INACTIVA");

    const politicas =
      (
        await tx.query.politicasEmpresa.findFirst({
          where: eq(t.politicasEmpresa.empresaId, empresa.id),
        })
      )?.politicas ?? POLITICAS_POR_DEFECTO;

    let oficinaId: string | null = null;
    if (pedido.oficina) {
      const partes = partesCodigoOficina(pedido.oficina);
      if (!partes) return rechazo("OFICINA_INEXISTENTE");
      const [oficina] = await tx
        .select({ id: t.oficinas.id })
        .from(t.oficinas)
        .innerJoin(t.canales, eq(t.canales.id, t.oficinas.canalId))
        .where(
          and(
            eq(t.oficinas.empresaId, empresa.id),
            eq(t.canales.codigo, partes.canal),
            eq(t.oficinas.codigo, partes.oficina),
            eq(t.oficinas.activa, true),
          ),
        );
      if (!oficina) return rechazo("OFICINA_INEXISTENTE");
      if (pedido.familia === "notificaciones" && !politicas.oficinasNotifican) {
        return rechazo("OFICINA_SIN_PERMISO");
      }
      oficinaId = oficina.id;
    }

    let factorCentesimos = 100;
    let medioEnvioId: string | null = null;
    if (FAMILIAS_CONSUMO[pedido.familia].usaMedio) {
      const medio = await tx.query.mediosEnvio.findFirst({
        where: and(eq(t.mediosEnvio.id, pedido.medio ?? "mail"), eq(t.mediosEnvio.activo, true)),
      });
      if (!medio) return rechazo("MEDIO_INVALIDO");
      factorCentesimos = medio.factorCentesimos;
      medioEnvioId = medio.id;
    }

    const fuentes = await fuentesDeCredito(tx, empresa.id, pedido.familia, hoy);

    // Lo que esta oficina ya tomó este mes del saldo de la empresa (para el tope).
    let topePozoRestante: number | null = null;
    if (oficinaId && politicas.topeMensualPozoPorOficina !== null) {
      const [usado] = await tx
        .select({ creditos: sql<number>`coalesce(-sum(${t.movimientosSaldo.creditos}), 0)::int` })
        .from(t.movimientosSaldo)
        .innerJoin(t.consumos, eq(t.consumos.id, t.movimientosSaldo.consumoId))
        .innerJoin(t.contratos, eq(t.contratos.id, t.movimientosSaldo.contratoId))
        .where(
          and(
            // Empresa y fecha del consumo: usa el índice (empresa_id, registrado_en)
            // de consumos en vez de recorrer todos los movimientos.
            eq(t.consumos.empresaId, empresa.id),
            gte(t.consumos.registradoEn, inicioDeMesArgentina(hoy)),
            eq(t.consumos.oficinaId, oficinaId),
            isNull(t.contratos.oficinaId),
          ),
        );
      topePozoRestante = Math.max(
        politicas.topeMensualPozoPorOficina - Number(usado?.creditos ?? 0),
        0,
      );
    }

    const plan = planificarDebito(fuentes, {
      cantidad: pedido.cantidad,
      factorCentesimos,
      oficinaId,
      modo: pedido.modo,
      usarPozoEmpresa: politicas.oficinasUsanPozoEmpresa,
      topePozoRestante,
    });

    const [consumo] = await tx
      .insert(t.consumos)
      .values({
        empresaId: empresa.id,
        oficinaId,
        familia: pedido.familia,
        sistema: pedido.sistema,
        transaccionExterna: pedido.transaccion,
        medioEnvioId,
        cantidad: pedido.cantidad,
        factorCentesimos,
        creditosSolicitados: plan.solicitado,
        creditosConsumidos: plan.consumido,
        concepto: pedido.concepto ?? null,
      })
      .returning({ id: t.consumos.id });

    if (plan.asignaciones.length) {
      await tx.insert(t.movimientosSaldo).values(
        plan.asignaciones.map((a) => {
          const fuente = fuentes.find(
            (f) => f.contratoId === a.contratoId && f.tipo === a.tipo,
          ) as FuenteConRecurso;
          return {
            contratoId: a.contratoId,
            recursoId: fuente.recursoId,
            clase: a.tipo,
            tipo: "CONSUMO" as const,
            creditos: -a.creditos,
            periodo: a.tipo === "CUPO_MENSUAL" ? hoy.slice(0, 7) : null,
            consumoId: consumo?.id ?? null,
            observacion: pedido.concepto?.slice(0, 200) ?? null,
          };
        }),
      );
    }

    // Disponible para quien consume: lo propio más el pozo de la empresa (si puede usarlo).
    const accesibles = fuentes.filter(
      (f) =>
        f.oficinaId === oficinaId ||
        (oficinaId !== null && f.oficinaId === null && politicas.oficinasUsanPozoEmpresa),
    );
    const disponibleAntes = accesibles.reduce((total, f) => total + f.disponible, 0);

    return exito({
      transaccion: pedido.transaccion,
      solicitado: plan.solicitado,
      consumido: plan.consumido,
      factor: factorCentesimos / 100,
      completo: plan.consumido === plan.solicitado,
      disponible: Math.max(disponibleAntes - plan.consumido, 0),
      repetido: false,
    });
  });
}
