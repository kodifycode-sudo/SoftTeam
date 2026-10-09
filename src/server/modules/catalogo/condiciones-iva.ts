import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { porcentaje } from "@/domain/dinero";
import { type CondicionFiscal, codigoCondicionIva } from "@/domain/facturacion/impuestos";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/*
 * Condiciones frente al IVA. Las
 * administra SOFTeam: alícuota, comprobante y código ARCA son datos, así un
 * cambio de criterio fiscal no requiere tocar el sistema.
 */

export function listarCondicionesIva(db: Ejecutor, paisId: string) {
  return db
    .select({
      codigo: t.condicionesIva.codigo,
      nombre: t.condicionesIva.nombre,
      codigoArca: t.condicionesIva.codigoArca,
      alicuota: t.condicionesIva.alicuota,
      comprobante: t.condicionesIva.comprobante,
      activa: t.condicionesIva.activa,
      orden: t.condicionesIva.orden,
      clientes: sql<number>`(select count(*)::int from ${t.clientes} c where c.condicion_iva = "condiciones_iva"."codigo")`,
    })
    .from(t.condicionesIva)
    .where(eq(t.condicionesIva.paisId, paisId))
    .orderBy(asc(t.condicionesIva.orden), asc(t.condicionesIva.nombre));
}

/** Condiciones activas de un país, para elegir en los formularios. */
export function opcionesCondicionesIva(db: Ejecutor, paisId = "AR") {
  return db
    .select({ codigo: t.condicionesIva.codigo, nombre: t.condicionesIva.nombre })
    .from(t.condicionesIva)
    .where(and(eq(t.condicionesIva.paisId, paisId), eq(t.condicionesIva.activa, true)))
    .orderBy(asc(t.condicionesIva.orden), asc(t.condicionesIva.nombre));
}

/** Nombre de cada condición (también las dadas de baja), para mostrar y exportar. */
export async function nombresCondicionesIva(db: Ejecutor): Promise<Map<string, string>> {
  const filas = await db
    .select({ codigo: t.condicionesIva.codigo, nombre: t.condicionesIva.nombre })
    .from(t.condicionesIva);
  return new Map(filas.map((f) => [f.codigo, f.nombre]));
}

/** ¿La condición existe, está activa y es del país? */
export async function condicionIvaValida(db: Ejecutor, paisId: string, codigo: string) {
  const fila = await db.query.condicionesIva.findFirst({
    columns: { codigo: true },
    where: and(
      eq(t.condicionesIva.codigo, codigo),
      eq(t.condicionesIva.paisId, paisId),
      eq(t.condicionesIva.activa, true),
    ),
  });
  return Boolean(fila);
}

/** Datos fiscales de una condición, para el cálculo de la orden. */
export async function condicionFiscal(
  db: Ejecutor,
  codigo: string,
): Promise<CondicionFiscal | undefined> {
  return db.query.condicionesIva.findFirst({
    columns: { codigo: true, codigoArca: true, alicuota: true, comprobante: true, activa: true },
    where: eq(t.condicionesIva.codigo, codigo),
  });
}

export const esquemaCondicionIva = z.object({
  /** Vacío: condición nueva (el código sale del nombre). */
  codigo: z.string().trim().max(30).optional(),
  paisId: z.string().length(2),
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(60),
  codigoArca: z.coerce
    .number({ error: "El código de ARCA, solo números." })
    .int({ error: "El código de ARCA, solo números." })
    .min(0, { error: "El código de ARCA, solo números." })
    .max(99, { error: "El código de ARCA tiene hasta 2 cifras." }),
  alicuota: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, {
      error: "Un porcentaje entre 0 y 100.",
    })
    .transform((v) => porcentaje(v)),
  comprobante: z.enum(["A", "B", "E"], { error: "Elegí el comprobante." }),
  activa: z.boolean(),
  orden: z.coerce.number().int().min(0).max(999).default(0),
});

export type ErrorCondicionIva = "NO_EXISTE" | "PAIS_INEXISTENTE" | "REPETIDA" | "EN_USO";

/**
 * Crea o modifica una condición. Un cambio de alícuota o de comprobante rige
 * para las órdenes que se confirmen después: las emitidas guardan su foto.
 * No se da de baja una condición que tienen clientes: primero hay que
 * cambiársela, porque sin condición activa no se les puede facturar.
 */
export async function guardarCondicionIva(
  db: Db,
  entrada: z.infer<typeof esquemaCondicionIva>,
  actorId: string,
): Promise<{ ok: true; codigo: string } | { ok: false; error: ErrorCondicionIva }> {
  return db.transaction(async (tx) => {
    const pais = await tx.query.paises.findFirst({
      columns: { id: true },
      where: eq(t.paises.id, entrada.paisId),
    });
    if (!pais) return { ok: false, error: "PAIS_INEXISTENTE" };
    const antes = entrada.codigo
      ? await tx.query.condicionesIva.findFirst({
          where: and(
            eq(t.condicionesIva.codigo, entrada.codigo),
            eq(t.condicionesIva.paisId, entrada.paisId),
          ),
        })
      : undefined;
    if (entrada.codigo && !antes) return { ok: false, error: "NO_EXISTE" };

    const repetida = await tx.query.condicionesIva.findFirst({
      columns: { codigo: true },
      where: and(
        eq(t.condicionesIva.paisId, entrada.paisId),
        sql`lower(${t.condicionesIva.nombre}) = lower(${entrada.nombre})`,
        antes ? ne(t.condicionesIva.codigo, antes.codigo) : undefined,
      ),
    });
    if (repetida) return { ok: false, error: "REPETIDA" };

    if (antes?.activa && !entrada.activa) {
      const [uso] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(t.clientes)
        .where(eq(t.clientes.condicionIva, antes.codigo));
      if ((uso?.n ?? 0) > 0) return { ok: false, error: "EN_USO" };
    }

    const codigo =
      antes?.codigo ??
      codigoCondicionIva(
        entrada.nombre,
        (await tx.select({ codigo: t.condicionesIva.codigo }).from(t.condicionesIva)).map(
          (c) => c.codigo,
        ),
      );
    const valores = {
      nombre: entrada.nombre,
      codigoArca: entrada.codigoArca,
      alicuota: entrada.alicuota,
      comprobante: entrada.comprobante,
      activa: entrada.activa,
      orden: entrada.orden,
    };
    if (antes) {
      await tx.update(t.condicionesIva).set(valores).where(eq(t.condicionesIva.codigo, codigo));
    } else {
      await tx.insert(t.condicionesIva).values({ codigo, paisId: entrada.paisId, ...valores });
    }
    await auditar(tx, {
      actorId,
      entidad: "condicion_iva",
      entidadId: codigo,
      accion: antes ? "modificacion" : "alta",
      antes: antes
        ? {
            nombre: antes.nombre,
            codigoArca: antes.codigoArca,
            alicuota: antes.alicuota.toString(),
            comprobante: antes.comprobante,
            activa: antes.activa,
            orden: antes.orden,
          }
        : null,
      despues: { paisId: entrada.paisId, ...valores, alicuota: valores.alicuota.toString() },
    });
    return { ok: true, codigo };
  });
}
