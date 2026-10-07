import { and, asc, eq, exists, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { centavos } from "@/domain/dinero";
import { type Fecha, fecha } from "@/domain/fecha";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

export interface FiltrosPaquetes {
  busqueda?: string;
  tipo?: "TEMPORAL" | "CONSUMIBLE";
  /** Muestra solo paquetes que incluyan recursos de estos productos. */
  productos?: string[];
  inactivos?: boolean;
  /** Excluye los paquetes privados (portal del cliente). */
  soloPublicos?: boolean;
  hoy: Fecha;
}

/** Condición de "vendible hoy": activo y dentro de su rango de venta. */
export const vendibleHoy = (hoy: Fecha) =>
  and(
    eq(t.paquetes.activo, true),
    lte(t.paquetes.ventaDesde, hoy),
    or(isNull(t.paquetes.ventaHasta), sql`${t.paquetes.ventaHasta} >= ${hoy}`),
  );

export async function listarPaquetes(db: Ejecutor, filtros: FiltrosPaquetes) {
  const patron = filtros.busqueda?.trim()
    ? `%${filtros.busqueda.trim().replace(/[\\%_]/g, "\\$&")}%`
    : undefined;

  const paquetes = await db
    .select({
      id: t.paquetes.id,
      codigo: t.paquetes.codigo,
      nombre: t.paquetes.nombre,
      descripcion: t.paquetes.descripcion,
      tipo: t.paquetes.tipo,
      privado: t.paquetes.privado,
      destacado: t.paquetes.destacado,
      activo: t.paquetes.activo,
      ventaDesde: t.paquetes.ventaDesde,
      ventaHasta: t.paquetes.ventaHasta,
      vendible: sql<boolean>`${vendibleHoy(filtros.hoy)}`,
      contratosVigentes: sql<number>`(select count(*)::int from ${t.contratos} c where c.paquete_id = ${t.paquetes.id} and c.estado in ('ACTIVO','PEND_PAGO_ACTIVO') and (c.hasta is null or c.hasta >= ${filtros.hoy}))`,
    })
    .from(t.paquetes)
    .where(
      and(
        filtros.inactivos ? undefined : vendibleHoy(filtros.hoy),
        filtros.tipo ? eq(t.paquetes.tipo, filtros.tipo) : undefined,
        filtros.soloPublicos ? eq(t.paquetes.privado, false) : undefined,
        patron ? or(ilike(t.paquetes.nombre, patron), ilike(t.paquetes.codigo, patron)) : undefined,
        ...(filtros.productos ?? []).map((productoId) =>
          exists(
            db
              .select({ uno: sql`1` })
              .from(t.paqueteRecursos)
              .innerJoin(t.recursos, eq(t.recursos.id, t.paqueteRecursos.recursoId))
              .where(
                and(
                  eq(t.paqueteRecursos.paqueteId, t.paquetes.id),
                  eq(t.recursos.productoId, productoId),
                  sql`${t.paqueteRecursos.cantidad} > 0`,
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(t.paquetes.nombre));

  const ids = paquetes.map((p) => p.id);
  if (ids.length === 0) return [];

  const [recursos, alternativas] = await Promise.all([
    db
      .select({
        paqueteId: t.paqueteRecursos.paqueteId,
        recursoId: t.recursos.id,
        nombre: t.recursos.nombre,
        unidad: t.recursos.unidad,
        clase: t.recursos.clase,
        productoId: t.recursos.productoId,
        cantidad: t.paqueteRecursos.cantidad,
      })
      .from(t.paqueteRecursos)
      .innerJoin(t.recursos, eq(t.recursos.id, t.paqueteRecursos.recursoId))
      .where(inArray(t.paqueteRecursos.paqueteId, ids))
      .orderBy(asc(t.recursos.orden)),
    db
      .select()
      .from(t.alternativas)
      .where(inArray(t.alternativas.paqueteId, ids))
      .orderBy(asc(t.alternativas.orden)),
  ]);

  return paquetes.map((p) => ({
    ...p,
    recursos: recursos.filter((r) => r.paqueteId === p.id && r.cantidad > 0),
    alternativas: alternativas.filter((a) => a.paqueteId === p.id),
    productos: [
      ...new Set(
        recursos.filter((r) => r.paqueteId === p.id && r.cantidad > 0).map((r) => r.productoId),
      ),
    ],
  }));
}

export type PaqueteListado = Awaited<ReturnType<typeof listarPaquetes>>[number];

export async function obtenerPaquete(db: Ejecutor, id: string) {
  const paquete = await db.query.paquetes.findFirst({ where: eq(t.paquetes.id, id) });
  if (!paquete) return undefined;
  const [recursos, alternativas] = await Promise.all([
    db.select().from(t.paqueteRecursos).where(eq(t.paqueteRecursos.paqueteId, id)),
    db
      .select()
      .from(t.alternativas)
      .where(eq(t.alternativas.paqueteId, id))
      .orderBy(asc(t.alternativas.orden)),
  ]);
  return { ...paquete, recursos, alternativas };
}

/** Catálogo de recursos agrupado por producto (para el formulario de paquetes). */
export async function recursosPorProducto(db: Ejecutor) {
  const filas = await db
    .select({
      recursoId: t.recursos.id,
      nombre: t.recursos.nombre,
      unidad: t.recursos.unidad,
      clase: t.recursos.clase,
      productoId: t.productos.id,
      producto: t.productos.nombre,
    })
    .from(t.recursos)
    .innerJoin(t.productos, eq(t.productos.id, t.recursos.productoId))
    .where(and(eq(t.recursos.activo, true), eq(t.productos.activo, true)))
    .orderBy(asc(t.productos.orden), asc(t.recursos.orden));
  const productos = new Map<
    string,
    { productoId: string; nombre: string; recursos: typeof filas }
  >();
  for (const f of filas) {
    const p = productos.get(f.productoId) ?? {
      productoId: f.productoId,
      nombre: f.producto,
      recursos: [],
    };
    p.recursos.push(f);
    productos.set(f.productoId, p);
  }
  return [...productos.values()];
}

// ─── Alta y edición ────────────────────────────────────────────────────────

const importe = z
  .string()
  .trim()
  .regex(/^\d{1,12}([.,]\d{1,2})?$/, { error: "Importe inválido" })
  .transform((v) => centavos(v));

export const esquemaAlternativa = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(2, { error: "Nombre de la alternativa" }).max(40),
  meses: z.coerce.number().int().min(1).max(60).nullable(),
  precioCompra: importe,
  precioRenovacion: importe,
  activa: z.boolean(),
});

export const esquemaPaquete = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,20}$/, { error: "3 a 20 caracteres: letras, números o guiones" }),
    nombre: z.string().trim().min(3, { error: "Ingresá el nombre" }).max(80),
    descripcion: z.string().trim().max(500).optional(),
    tipo: z.enum(["TEMPORAL", "CONSUMIBLE"]),
    privado: z.boolean(),
    destacado: z.boolean().default(false),
    activo: z.boolean(),
    ventaDesde: z.string().transform((v, ctx) => {
      try {
        return fecha(v);
      } catch {
        ctx.addIssue({ code: "custom", message: "Fecha inválida" });
        return z.NEVER;
      }
    }),
    ventaHasta: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        try {
          return fecha(v);
        } catch {
          ctx.addIssue({ code: "custom", message: "Fecha inválida" });
          return z.NEVER;
        }
      }),
    recursos: z.record(z.string(), z.coerce.number().int().min(0).max(10_000_000)),
    alternativas: z
      .array(esquemaAlternativa)
      .min(1, { error: "Agregá al menos una alternativa de precio" }),
  })
  .superRefine((p, ctx) => {
    if (p.ventaHasta && p.ventaHasta < p.ventaDesde) {
      ctx.addIssue({
        code: "custom",
        path: ["ventaHasta"],
        message: "Debe ser posterior al inicio",
      });
    }
    p.alternativas.forEach((a, i) => {
      if (p.tipo === "TEMPORAL" && a.meses === null) {
        ctx.addIssue({
          code: "custom",
          path: ["alternativas", i, "meses"],
          message: "Indicá los meses",
        });
      }
      if (p.tipo === "CONSUMIBLE" && a.meses !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["alternativas", i, "meses"],
          message: "Los consumibles no tienen duración",
        });
      }
    });
  });

export type EntradaPaquete = z.infer<typeof esquemaPaquete>;

export type ErrorGuardarPaquete =
  | "CODIGO_DUPLICADO"
  | "RECURSO_INCOMPATIBLE"
  | "SIN_RECURSOS"
  | "NO_EXISTE";

/**
 * Crea o actualiza un paquete con sus recursos y alternativas en una sola
 * transacción. Valida que un temporal no traiga saldos prepagos y que un
 * consumible solo traiga saldos (nunca se mezclan).
 */
export async function guardarPaquete(
  db: Db,
  entrada: EntradaPaquete & { id?: string; paisId: string },
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: ErrorGuardarPaquete }> {
  const conCantidad = Object.entries(entrada.recursos).filter(([, cantidad]) => cantidad > 0);
  if (conCantidad.length === 0) return { ok: false, error: "SIN_RECURSOS" };

  const clases = await db
    .select({ id: t.recursos.id, clase: t.recursos.clase })
    .from(t.recursos)
    .where(
      inArray(
        t.recursos.id,
        conCantidad.map(([id]) => id),
      ),
    );
  if (clases.length !== conCantidad.length) return { ok: false, error: "RECURSO_INCOMPATIBLE" };
  const incompatible = clases.some((r) =>
    entrada.tipo === "CONSUMIBLE" ? r.clase !== "SALDO" : r.clase === "SALDO",
  );
  if (incompatible) return { ok: false, error: "RECURSO_INCOMPATIBLE" };

  const duplicado = await db.query.paquetes.findFirst({
    columns: { id: true },
    where: eq(t.paquetes.codigo, entrada.codigo),
  });
  if (duplicado && duplicado.id !== entrada.id) return { ok: false, error: "CODIGO_DUPLICADO" };

  return db.transaction(async (tx) => {
    const valores = {
      codigo: entrada.codigo,
      nombre: entrada.nombre,
      descripcion: entrada.descripcion || null,
      tipo: entrada.tipo,
      privado: entrada.privado,
      destacado: entrada.destacado,
      activo: entrada.activo,
      ventaDesde: entrada.ventaDesde,
      ventaHasta: entrada.ventaHasta,
      paisId: entrada.paisId,
    };
    let id = entrada.id;
    let antes: unknown = null;
    if (id) {
      antes = await tx.query.paquetes.findFirst({ where: eq(t.paquetes.id, id) });
      if (!antes) return { ok: false as const, error: "NO_EXISTE" as const };
      await tx.update(t.paquetes).set(valores).where(eq(t.paquetes.id, id));
      await tx.delete(t.paqueteRecursos).where(eq(t.paqueteRecursos.paqueteId, id));
    } else {
      const [nuevo] = await tx.insert(t.paquetes).values(valores).returning({ id: t.paquetes.id });
      id = nuevo?.id as string;
    }
    const paqueteId = id as string;

    await tx
      .insert(t.paqueteRecursos)
      .values(conCantidad.map(([recursoId, cantidad]) => ({ paqueteId, recursoId, cantidad })));

    // Las alternativas existentes se actualizan (los contratos las referencian);
    // las que se quitan del formulario se desactivan, nunca se borran.
    const existentes = await tx
      .select({ id: t.alternativas.id })
      .from(t.alternativas)
      .where(eq(t.alternativas.paqueteId, paqueteId));
    const enviadas = new Set(entrada.alternativas.flatMap((a) => (a.id ? [a.id] : [])));
    for (const [orden, a] of entrada.alternativas.entries()) {
      const datos = {
        nombre: a.nombre,
        meses: entrada.tipo === "CONSUMIBLE" ? null : a.meses,
        precioCompra: a.precioCompra,
        precioRenovacion: a.precioRenovacion,
        activa: a.activa,
        orden,
      };
      if (a.id && existentes.some((e) => e.id === a.id)) {
        await tx.update(t.alternativas).set(datos).where(eq(t.alternativas.id, a.id));
      } else {
        await tx.insert(t.alternativas).values({ ...datos, paqueteId });
      }
    }
    const quitadas = existentes.filter((e) => !enviadas.has(e.id)).map((e) => e.id);
    if (quitadas.length) {
      await tx
        .update(t.alternativas)
        .set({ activa: false })
        .where(inArray(t.alternativas.id, quitadas));
    }

    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "paquete",
      entidadId: paqueteId,
      accion: entrada.id ? "modificacion" : "alta",
      antes: antes as object | null,
      despues: { ...valores, recursos: Object.fromEntries(conCantidad) },
    });
    return { ok: true as const, id: paqueteId };
  });
}

export async function cambiarActivoPaquete(db: Db, id: string, activo: boolean, actorId: string) {
  await db.transaction(async (tx) => {
    await tx.update(t.paquetes).set({ activo }).where(eq(t.paquetes.id, id));
    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "paquete",
      entidadId: id,
      accion: activo ? "activar" : "inactivar",
    });
  });
}
