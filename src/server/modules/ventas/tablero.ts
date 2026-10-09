import { and, asc, countDistinct, eq, gte, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { type Fecha, inicioDeMes, sumarDias, sumarMeses } from "@/domain/fecha";
import { semaforoNegociacion } from "@/domain/licencias/periodo";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { leerParametroDe } from "../parametros";

/*
 * Tablero de SOFTeam al ingresar: cajas con los casos que
 * piden una acción. Son consultas sobre datos existentes.
 */

const finDeMes = (f: Fecha) => sumarDias(sumarMeses(inicioDeMes(f), 1), -1);

/**
 * Paquetes del trimestre inicial (sin día de vencimiento), sin renovación,
 * que vencen hasta fin del mes en curso, incluidos los ya vencidos que siguen
 * sin negociar.
 */
export async function renovacionesANegociar(db: Ejecutor, hoy: Fecha) {
  const dias = await leerParametroDe(db, "tablero.dias_semaforo");
  const filas = await db
    .select({
      contratoId: t.contratos.id,
      hasta: t.contratos.hasta,
      cantidad: t.contratos.cantidad,
      paquete: t.paquetes.nombre,
      empresa: { id: t.empresas.id, nombre: t.empresas.nombre },
      cliente: { id: t.clientes.id, nombre: t.clientes.nombre },
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .where(
      and(
        eq(t.contratos.tipoPaquete, "TEMPORAL"),
        isNull(t.contratos.diaVenc),
        ne(t.contratos.estado, "CANCELADO"),
        isNotNull(t.contratos.hasta),
        lte(t.contratos.hasta, finDeMes(hoy)),
        sql`not exists (select 1 from ${t.contratos} r where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO')`,
      ),
    )
    .orderBy(asc(t.contratos.hasta));
  return filas.map((f) => ({
    ...f,
    hasta: f.hasta as Fecha,
    semaforo: semaforoNegociacion(f.hasta as Fecha, hoy, dias),
  }));
}

/** Altas a grupo que esperan la próxima orden colectiva. */
export async function altasAGrupoPendientes(db: Ejecutor) {
  return db
    .select({
      contratoId: t.contratos.id,
      desde: t.contratos.desde,
      hasta: t.contratos.hasta,
      cantidad: t.contratos.cantidad,
      prorrataDias: t.contratos.prorrataDias,
      importe: t.contratos.precioLista,
      paquete: t.paquetes.nombre,
      empresa: { id: t.empresas.id, nombre: t.empresas.nombre },
      cliente: { id: t.clientes.id, nombre: t.clientes.nombre },
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .where(and(isNull(t.contratos.ordenId), ne(t.contratos.estado, "CANCELADO")))
    .orderBy(asc(t.contratos.creadoEn));
}

/** Contadores de las cajas del tablero. */
export async function cajasTablero(db: Ejecutor, hoy: Fecha) {
  const [negociar, altas, [pendientes], [errores], [sinSaldo]] = await Promise.all([
    renovacionesANegociar(db, hoy),
    altasAGrupoPendientes(db),
    db
      .select({ n: countDistinct(t.ordenes.id) })
      .from(t.ordenes)
      .where(eq(t.ordenes.estado, "PEND_PAGO")),
    db
      .select({ n: countDistinct(t.ordenes.id) })
      .from(t.ordenes)
      .where(and(eq(t.ordenes.estado, "PEND_PAGO"), eq(t.ordenes.pagoError, true))),
    // Empresas con pedidos que no alcanzaron el saldo en los últimos 7 días.
    db
      .select({ n: countDistinct(t.alertas.empresaId) })
      .from(t.alertas)
      .where(
        and(
          eq(t.alertas.tipo, "CONSUMIBLE_SIN_SALDO"),
          gte(t.alertas.generadaEn, new Date(`${sumarDias(hoy, -7)}T03:00:00Z`)),
        ),
      ),
  ]);
  return {
    negociar: {
      total: negociar.length,
      vencidos: negociar.filter((n) => n.semaforo === "ROJO").length,
      proximos: negociar.filter((n) => n.semaforo === "AMARILLO").length,
    },
    altasAGrupo: altas.length,
    pendientesDePago: pendientes?.n ?? 0,
    erroresDePago: errores?.n ?? 0,
    sinSaldo: sinSaldo?.n ?? 0,
  };
}

/**
 * Anula un alta a grupo mientras no la incorporó una orden colectiva.
 * Después queda sujeta a las reglas de la orden.
 */
export async function anularAltaAGrupo(
  db: Db,
  contratoId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: "NO_EXISTE" }> {
  return db.transaction(async (tx) => {
    const [contrato] = await tx
      .select()
      .from(t.contratos)
      .where(
        and(
          eq(t.contratos.id, contratoId),
          isNull(t.contratos.ordenId),
          ne(t.contratos.estado, "CANCELADO"),
        ),
      )
      .for("update");
    if (!contrato) return { ok: false, error: "NO_EXISTE" };
    await tx.update(t.contratos).set({ estado: "CANCELADO" }).where(eq(t.contratos.id, contratoId));
    await auditar(tx, {
      actorId,
      actorTipo: "usuario",
      entidad: "contrato",
      empresaId: contrato.empresaId,
      entidadId: contrato.id,
      accion: "anular_alta_a_grupo",
      antes: { estado: contrato.estado },
      despues: { estado: "CANCELADO" },
    });
    return { ok: true };
  });
}
