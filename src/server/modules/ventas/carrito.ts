import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { TRIMESTRAL_INICIAL } from "@/domain/licencias/periodo";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { vendibleHoy } from "../catalogo/paquetes";

export const CANTIDAD_MAXIMA = 99;

/**
 * Carrito de la empresa o, en la compra delegada, de una oficina: cada una
 * arma y confirma el suyo sin mezclarse.
 */
const delCarrito = (empresaId: string, oficinaId: string | null) =>
  and(
    eq(t.carritoItems.empresaId, empresaId),
    oficinaId ? eq(t.carritoItems.oficinaId, oficinaId) : isNull(t.carritoItems.oficinaId),
  );

export async function listarCarrito(
  db: Ejecutor,
  empresaId: string,
  oficinaId: string | null = null,
) {
  return db
    .select({
      id: t.carritoItems.id,
      cantidad: t.carritoItems.cantidad,
      tipoAccion: t.carritoItems.tipoAccion,
      alternativaId: t.alternativas.id,
      alternativa: t.alternativas.nombre,
      meses: t.alternativas.meses,
      precioCompra: t.alternativas.precioCompra,
      precioRenovacion: t.alternativas.precioRenovacion,
      alternativaActiva: t.alternativas.activa,
      paqueteId: t.paquetes.id,
      paquete: t.paquetes.nombre,
      codigo: t.paquetes.codigo,
      tipoPaquete: t.paquetes.tipo,
      paqueteActivo: t.paquetes.activo,
      /** Renovación manual: el contrato que se renueva, su vencimiento y su bonificación recurrente. */
      contratoAnteriorId: t.carritoItems.contratoAnteriorId,
      anteriorHasta: sql<Fecha | null>`(select c.hasta from ${t.contratos} c where c.id = ${t.carritoItems.contratoAnteriorId})`,
      anteriorDiaVenc: sql<
        number | null
      >`(select c.dia_venc from ${t.contratos} c where c.id = ${t.carritoItems.contratoAnteriorId})`,
      bonifRenovacion:
        sql<bigint>`coalesce((select case when c.bonif_recurrente then c.bonif_porcentaje else 0 end from ${t.contratos} c where c.id = ${t.carritoItems.contratoAnteriorId}), 0)`.mapWith(
          t.contratos.bonifPorcentaje,
        ),
    })
    .from(t.carritoItems)
    .innerJoin(t.alternativas, eq(t.alternativas.id, t.carritoItems.alternativaId))
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(delCarrito(empresaId, oficinaId))
    .orderBy(asc(t.carritoItems.creadoEn));
}

export type ItemCarrito = Awaited<ReturnType<typeof listarCarrito>>[number];

export async function cantidadEnCarrito(
  db: Ejecutor,
  empresaId: string,
  oficinaId: string | null = null,
): Promise<number> {
  const [fila] = await db
    .select({ total: sql<number>`coalesce(sum(${t.carritoItems.cantidad}), 0)::int` })
    .from(t.carritoItems)
    .where(delCarrito(empresaId, oficinaId));
  return fila?.total ?? 0;
}

export type ErrorCarrito = "NO_DISPONIBLE" | "CANTIDAD_INVALIDA" | "NO_EXISTE";

/**
 * Agrega una alternativa al carrito de la empresa. Solo se pueden agregar
 * paquetes públicos, a la venta hoy y del país de la empresa. Si ya estaba,
 * suma la cantidad.
 */
export async function agregarAlCarrito(
  db: Db,
  entrada: {
    empresaId: string;
    /** Compra delegada: la oficina que compra (`null`: toda la empresa). */
    oficinaId?: string | null;
    alternativaId: string;
    cantidad: number;
    usuarioId: string;
  },
  hoy: Fecha = hoyArgentina(),
): Promise<{ ok: true } | { ok: false; error: ErrorCarrito }> {
  if (
    !Number.isInteger(entrada.cantidad) ||
    entrada.cantidad < 1 ||
    entrada.cantidad > CANTIDAD_MAXIMA
  ) {
    return { ok: false, error: "CANTIDAD_INVALIDA" };
  }
  const [disponible] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.paisId, t.paquetes.paisId))
    .where(
      and(
        eq(t.alternativas.id, entrada.alternativaId),
        eq(t.alternativas.activa, true),
        eq(t.empresas.id, entrada.empresaId),
        eq(t.paquetes.privado, false),
        vendibleHoy(hoy),
      ),
    );
  if (!disponible) return { ok: false, error: "NO_DISPONIBLE" };

  return db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: t.carritoItems.id, cantidad: t.carritoItems.cantidad })
      .from(t.carritoItems)
      .where(
        and(
          delCarrito(entrada.empresaId, entrada.oficinaId ?? null),
          eq(t.carritoItems.alternativaId, entrada.alternativaId),
          eq(t.carritoItems.tipoAccion, "ALTA"),
        ),
      )
      .for("update");
    if (existente) {
      const cantidad = Math.min(existente.cantidad + entrada.cantidad, CANTIDAD_MAXIMA);
      await tx.update(t.carritoItems).set({ cantidad }).where(eq(t.carritoItems.id, existente.id));
    } else {
      await tx.insert(t.carritoItems).values({
        empresaId: entrada.empresaId,
        oficinaId: entrada.oficinaId ?? null,
        alternativaId: entrada.alternativaId,
        cantidad: entrada.cantidad,
        agregadoPor: entrada.usuarioId,
      });
    }
    return { ok: true as const };
  });
}

/**
 * Cambia la cantidad de una línea (0 la quita). Siempre acotado a la empresa.
 * Una renovación renueva el contrato tal cual: se puede quitar, no cambiar la
 * cantidad.
 */
export async function cambiarCantidad(
  db: Db,
  entrada: { empresaId: string; oficinaId?: string | null; itemId: string; cantidad: number },
): Promise<{ ok: true } | { ok: false; error: ErrorCarrito }> {
  if (
    !Number.isInteger(entrada.cantidad) ||
    entrada.cantidad < 0 ||
    entrada.cantidad > CANTIDAD_MAXIMA
  ) {
    return { ok: false, error: "CANTIDAD_INVALIDA" };
  }
  const donde = and(
    eq(t.carritoItems.id, entrada.itemId),
    delCarrito(entrada.empresaId, entrada.oficinaId ?? null),
    entrada.cantidad > 0 ? eq(t.carritoItems.tipoAccion, "ALTA") : undefined,
  );
  const filas =
    entrada.cantidad === 0
      ? await db.delete(t.carritoItems).where(donde).returning({ id: t.carritoItems.id })
      : await db
          .update(t.carritoItems)
          .set({ cantidad: entrada.cantidad })
          .where(donde)
          .returning({ id: t.carritoItems.id });
  return filas.length ? { ok: true } : { ok: false, error: "NO_EXISTE" };
}

// ─── Renovación manual ───────────────────────────────────────────────────────

/**
 * Condiciones para renovar un contrato a mano: temporal, vigente, de la bolsa
 * (empresa u oficina) que compra, sin una renovación no cancelada y sin estar
 * ya en el carrito.
 */
const renovable = (empresaId: string, oficinaId: string | null, hoy: Fecha) =>
  and(
    eq(t.contratos.empresaId, empresaId),
    oficinaId ? eq(t.contratos.oficinaId, oficinaId) : isNull(t.contratos.oficinaId),
    eq(t.contratos.tipoPaquete, "TEMPORAL"),
    inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
    isNotNull(t.contratos.hasta),
    gte(t.contratos.hasta, hoy),
    // El trimestre inicial no se renueva desde acá: su continuidad se negocia.
    isNotNull(t.contratos.diaVenc),
    sql`not exists (select 1 from ${t.contratos} r where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO')`,
    sql`not exists (select 1 from ${t.carritoItems} ci where ci.contrato_anterior_id = ${t.contratos.id})`,
  );

/**
 * Paquetes que la empresa (u oficina) puede renovar ahora, con las
 * alternativas activas de cada uno (con su precio de renovación).
 */
export async function renovablesDeEmpresa(
  db: Ejecutor,
  empresaId: string,
  oficinaId: string | null,
  hoy: Fecha = hoyArgentina(),
) {
  const contratos = await db
    .select({
      id: t.contratos.id,
      paqueteId: t.contratos.paqueteId,
      alternativaId: t.contratos.alternativaId,
      cantidad: t.contratos.cantidad,
      hasta: t.contratos.hasta,
    })
    .from(t.contratos)
    .where(renovable(empresaId, oficinaId, hoy));
  if (contratos.length === 0) return [];
  const alternativas = await db
    .select({
      id: t.alternativas.id,
      paqueteId: t.alternativas.paqueteId,
      nombre: t.alternativas.nombre,
      meses: t.alternativas.meses,
      precioRenovacion: t.alternativas.precioRenovacion,
    })
    .from(t.alternativas)
    .where(
      and(
        inArray(t.alternativas.paqueteId, [...new Set(contratos.map((c) => c.paqueteId))]),
        eq(t.alternativas.activa, true),
        isNotNull(t.alternativas.meses),
        // El trimestral es solo para el alta inicial.
        ne(t.alternativas.meses, TRIMESTRAL_INICIAL),
      ),
    )
    .orderBy(asc(t.alternativas.meses));
  return contratos
    .map((c) => ({ ...c, alternativas: alternativas.filter((a) => a.paqueteId === c.paqueteId) }))
    .filter((c) => c.alternativas.length > 0);
}

export type Renovable = Awaited<ReturnType<typeof renovablesDeEmpresa>>[number];

export type ErrorRenovacionManual = "NO_RENOVABLE" | "ALTERNATIVA_INVALIDA";

/**
 * Agrega al carrito la renovación de un contrato vigente, con la alternativa
 * elegida (puede pasar de mensual a anual). Renueva la misma cantidad; las
 * fechas empalman con el vencimiento al confirmar.
 */
export async function agregarRenovacion(
  db: Db,
  entrada: {
    empresaId: string;
    oficinaId?: string | null;
    contratoId: string;
    alternativaId: string;
    usuarioId: string;
  },
  hoy: Fecha = hoyArgentina(),
): Promise<{ ok: true } | { ok: false; error: ErrorRenovacionManual }> {
  return db.transaction(async (tx) => {
    const [contrato] = await tx
      .select({
        id: t.contratos.id,
        paqueteId: t.contratos.paqueteId,
        cantidad: t.contratos.cantidad,
      })
      .from(t.contratos)
      .where(
        and(
          eq(t.contratos.id, entrada.contratoId),
          renovable(entrada.empresaId, entrada.oficinaId ?? null, hoy),
        ),
      )
      .for("update");
    if (!contrato) return { ok: false, error: "NO_RENOVABLE" };
    const alternativa = await tx.query.alternativas.findFirst({
      columns: { id: true },
      where: and(
        eq(t.alternativas.id, entrada.alternativaId),
        eq(t.alternativas.paqueteId, contrato.paqueteId),
        eq(t.alternativas.activa, true),
        isNotNull(t.alternativas.meses),
        ne(t.alternativas.meses, TRIMESTRAL_INICIAL),
      ),
    });
    if (!alternativa) return { ok: false, error: "ALTERNATIVA_INVALIDA" };
    await tx.insert(t.carritoItems).values({
      empresaId: entrada.empresaId,
      oficinaId: entrada.oficinaId ?? null,
      alternativaId: alternativa.id,
      tipoAccion: "RENOVACION",
      contratoAnteriorId: contrato.id,
      cantidad: contrato.cantidad,
      agregadoPor: entrada.usuarioId,
    });
    return { ok: true };
  });
}
