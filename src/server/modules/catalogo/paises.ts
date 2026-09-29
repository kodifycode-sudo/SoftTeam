import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { porcentaje } from "@/domain/dinero";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/*
 * Países, monedas y provincias (`STLicPaises`, `STLicMonedas`,
 * `STLicProvincias`): los administra SOFTeam. El país define la moneda y el
 * IVA con que se vende; la cotización lleva cada moneda a pesos.
 */

/** Moneda base: vale 1 y no se desactiva. */
export const MONEDA_BASE = "ARS";

export function listarMonedas(db: Ejecutor) {
  return db
    .select({
      codigo: t.monedas.codigo,
      nombre: t.monedas.nombre,
      simbolo: t.monedas.simbolo,
      cotizacion: t.monedas.cotizacion,
      cotizacionEn: t.monedas.cotizacionEn,
      activa: t.monedas.activa,
      paises: sql<number>`(select count(*)::int from ${t.paises} p where p.moneda = "monedas"."codigo")`,
    })
    .from(t.monedas)
    .orderBy(sql`${t.monedas.activa} desc`, asc(t.monedas.codigo));
}

export function listarPaises(db: Ejecutor) {
  return db
    .select({
      id: t.paises.id,
      nombre: t.paises.nombre,
      nombreCorto: t.paises.nombreCorto,
      prefijoTelefonico: t.paises.prefijoTelefonico,
      moneda: t.paises.moneda,
      alicuotaIvaGeneral: t.paises.alicuotaIvaGeneral,
      activo: t.paises.activo,
      provincias: sql<number>`(select count(*)::int from ${t.provincias} p where p.pais_id = "paises"."id" and p.activa)`,
      empresas: sql<number>`(select count(*)::int from ${t.empresas} e where e.pais_id = "paises"."id")`,
    })
    .from(t.paises)
    .orderBy(sql`${t.paises.activo} desc`, asc(t.paises.nombre));
}

export function listarProvincias(db: Ejecutor, paisId: string, soloActivas = false) {
  return db
    .select()
    .from(t.provincias)
    .where(
      and(eq(t.provincias.paisId, paisId), soloActivas ? eq(t.provincias.activa, true) : undefined),
    )
    .orderBy(asc(t.provincias.nombre));
}

/** Nombres de las provincias activas de un país (para formularios y validaciones). */
export async function nombresDeProvincias(db: Ejecutor, paisId: string): Promise<string[]> {
  return (await listarProvincias(db, paisId, true)).map((p) => p.nombre);
}

/** ¿La provincia existe y está activa en el país? */
export async function provinciaValida(db: Ejecutor, paisId: string, nombre: string) {
  const fila = await db.query.provincias.findFirst({
    columns: { id: true },
    where: and(
      eq(t.provincias.paisId, paisId),
      eq(t.provincias.nombre, nombre),
      eq(t.provincias.activa, true),
    ),
  });
  return Boolean(fila);
}

/** Decimal con coma o punto ("1.234,56" no: sin separador de miles). */
const decimal = (maximo: number, mensaje: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => /^\d{1,12}(\.\d{1,6})?$/.test(v) && Number(v) > 0 && Number(v) <= maximo, {
      error: mensaje,
    });

export const esquemaMoneda = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: "Tres letras (ISO 4217, p. ej. USD)." }),
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(40),
  simbolo: z.string().trim().min(1, { error: "Ingresá el símbolo." }).max(5),
  /** Pesos por unidad; vacío: sin cotización. */
  cotizacion: z.union([
    z.literal("").transform(() => null),
    decimal(1_000_000_000, "Un número mayor que 0 (hasta 6 decimales)."),
  ]),
  activa: z.boolean(),
});

export type ErrorMoneda = "MONEDA_BASE" | "EN_USO";

/**
 * Crea o modifica una moneda. El peso es la base: vale 1 y no se desactiva.
 * No se desactiva una moneda que usa un país activo.
 */
export async function guardarMoneda(
  db: Db,
  entrada: z.infer<typeof esquemaMoneda>,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorMoneda }> {
  const esBase = entrada.codigo === MONEDA_BASE;
  if (esBase && !entrada.activa) return { ok: false, error: "MONEDA_BASE" };
  return db.transaction(async (tx) => {
    const antes = await tx.query.monedas.findFirst({
      where: eq(t.monedas.codigo, entrada.codigo),
    });
    if (antes?.activa && !entrada.activa) {
      const enUso = await tx.query.paises.findFirst({
        columns: { id: true },
        where: and(eq(t.paises.moneda, entrada.codigo), eq(t.paises.activo, true)),
      });
      if (enUso) return { ok: false, error: "EN_USO" };
    }
    const cotizacion = esBase ? "1" : entrada.cotizacion;
    const cambioCotizacion = Number(antes?.cotizacion ?? 0) !== Number(cotizacion ?? 0);
    const valores = {
      nombre: entrada.nombre,
      simbolo: entrada.simbolo,
      cotizacion,
      activa: entrada.activa,
      ...(cambioCotizacion ? { cotizacionEn: cotizacion ? new Date() : null } : {}),
    };
    await tx
      .insert(t.monedas)
      .values({ codigo: entrada.codigo, ...valores })
      .onConflictDoUpdate({ target: t.monedas.codigo, set: valores });
    await auditar(tx, {
      actorId,
      entidad: "moneda",
      entidadId: entrada.codigo,
      accion: antes ? "modificacion" : "alta",
      antes: antes
        ? {
            nombre: antes.nombre,
            simbolo: antes.simbolo,
            cotizacion: antes.cotizacion,
            activa: antes.activa,
          }
        : null,
      despues: {
        nombre: entrada.nombre,
        simbolo: entrada.simbolo,
        cotizacion,
        activa: entrada.activa,
      },
    });
    return { ok: true };
  });
}

export const esquemaPais = z.object({
  id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, { error: "Dos letras (ISO 3166, p. ej. UY)." }),
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(60),
  nombreCorto: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v || null),
  prefijoTelefonico: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, { error: "El código internacional, solo números (p. ej. 598)." }),
  moneda: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { error: "Elegí la moneda." }),
  alicuotaIvaGeneral: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => /^\d{1,2}(\.\d{1,2})?$/.test(v), {
      error: "Un porcentaje entre 0 y 99,99.",
    })
    .transform((v) => porcentaje(v)),
  activo: z.boolean(),
});

export type ErrorPais = "MONEDA_INVALIDA" | "ULTIMO_ACTIVO";

/**
 * Crea o modifica un país. Su moneda tiene que existir y estar activa. Un país
 * inactivo deja de ofrecerse para clientes nuevos (los que ya tiene siguen
 * igual); siempre queda al menos uno activo.
 */
export async function guardarPais(
  db: Db,
  entrada: z.infer<typeof esquemaPais>,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorPais }> {
  return db.transaction(async (tx) => {
    const moneda = await tx.query.monedas.findFirst({
      where: and(eq(t.monedas.codigo, entrada.moneda), eq(t.monedas.activa, true)),
    });
    if (!moneda) return { ok: false, error: "MONEDA_INVALIDA" };
    const antes = await tx.query.paises.findFirst({ where: eq(t.paises.id, entrada.id) });
    if (antes?.activo && !entrada.activo) {
      const otro = await tx.query.paises.findFirst({
        columns: { id: true },
        where: and(eq(t.paises.activo, true), ne(t.paises.id, entrada.id)),
      });
      if (!otro) return { ok: false, error: "ULTIMO_ACTIVO" };
    }
    const valores = {
      nombre: entrada.nombre,
      nombreCorto: entrada.nombreCorto,
      prefijoTelefonico: entrada.prefijoTelefonico,
      moneda: entrada.moneda,
      alicuotaIvaGeneral: entrada.alicuotaIvaGeneral,
      activo: entrada.activo,
    };
    await tx
      .insert(t.paises)
      .values({ id: entrada.id, ...valores })
      .onConflictDoUpdate({ target: t.paises.id, set: valores });
    const texto = (v: typeof valores) => ({
      ...v,
      alicuotaIvaGeneral: v.alicuotaIvaGeneral.toString(),
    });
    await auditar(tx, {
      actorId,
      entidad: "pais",
      entidadId: entrada.id,
      accion: antes ? "modificacion" : "alta",
      antes: antes ? texto(antes) : null,
      despues: texto(valores),
    });
    return { ok: true };
  });
}

export const esquemaProvincia = z.object({
  id: z.uuid().optional(),
  paisId: z.string().length(2),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,5}$/, { error: "Hasta 5 letras o números." }),
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(60),
  activa: z.boolean(),
});

export type ErrorProvincia = "NO_EXISTE" | "PAIS_INEXISTENTE" | "REPETIDA";

/** Crea o modifica una provincia. Una inactiva no se ofrece en los domicilios nuevos. */
export async function guardarProvincia(
  db: Db,
  entrada: z.infer<typeof esquemaProvincia>,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorProvincia }> {
  return db.transaction(async (tx) => {
    const pais = await tx.query.paises.findFirst({
      columns: { id: true },
      where: eq(t.paises.id, entrada.paisId),
    });
    if (!pais) return { ok: false, error: "PAIS_INEXISTENTE" };
    const antes = entrada.id
      ? await tx.query.provincias.findFirst({
          where: and(eq(t.provincias.id, entrada.id), eq(t.provincias.paisId, entrada.paisId)),
        })
      : undefined;
    if (entrada.id && !antes) return { ok: false, error: "NO_EXISTE" };
    const repetida = await tx.query.provincias.findFirst({
      columns: { id: true },
      where: and(
        eq(t.provincias.paisId, entrada.paisId),
        sql`(upper(${t.provincias.codigo}) = ${entrada.codigo} or lower(${t.provincias.nombre}) = lower(${entrada.nombre}))`,
        antes ? ne(t.provincias.id, antes.id) : undefined,
      ),
    });
    if (repetida) return { ok: false, error: "REPETIDA" };
    const valores = { codigo: entrada.codigo, nombre: entrada.nombre, activa: entrada.activa };
    let id = antes?.id;
    if (antes) {
      await tx.update(t.provincias).set(valores).where(eq(t.provincias.id, antes.id));
    } else {
      id = crypto.randomUUID();
      await tx.insert(t.provincias).values({ id, paisId: entrada.paisId, ...valores });
    }
    await auditar(tx, {
      actorId,
      entidad: "provincia",
      entidadId: id ?? entrada.codigo,
      accion: antes ? "modificacion" : "alta",
      antes: antes ? { codigo: antes.codigo, nombre: antes.nombre, activa: antes.activa } : null,
      despues: { paisId: entrada.paisId, ...valores },
    });
    return { ok: true };
  });
}
