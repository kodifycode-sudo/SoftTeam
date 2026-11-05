import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { porcentaje } from "@/domain/dinero";
import { caracteristicasDeTipo, TIPOS_MEDIO_PAGO } from "@/domain/facturacion/medio-pago";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

export function listarMediosPago(db: Ejecutor) {
  return db.select().from(t.mediosPago).orderBy(asc(t.mediosPago.orden), asc(t.mediosPago.nombre));
}

export type MedioPagoFila = Awaited<ReturnType<typeof listarMediosPago>>[number];

export const esquemaMedioPago = z.object({
  nombre: z.string().trim().min(3, { error: "Ingresá el nombre" }).max(60),
  ajustePorcentaje: z
    .string()
    .trim()
    .regex(/^-?\d{1,2}([.,]\d{1,2})?$/, { error: "Entre -99,99 y 99,99" })
    .transform(porcentaje),
  habilitadoAlta: z.boolean(),
  habilitadoAdicional: z.boolean(),
  habilitadoRenovacion: z.boolean(),
  /** Modos de facturación con que se puede usar. */
  modosFacturacion: z
    .array(z.int().min(0).max(3))
    .min(1, { error: "Elegí al menos un modo de facturación." }),
  activo: z.boolean(),
  instrucciones: z.string().trim().max(1000).optional(),
});

export type EntradaMedioPago = z.infer<typeof esquemaMedioPago>;

/** Actualiza un medio de pago y audita el cambio (el ajuste afecta todos los cálculos futuros). */
export async function actualizarMedioPago(
  db: Db,
  id: string,
  entrada: EntradaMedioPago,
  actorId: string,
) {
  return db.transaction(async (tx) => {
    const antes = await tx.query.mediosPago.findFirst({ where: eq(t.mediosPago.id, id) });
    if (!antes) return false;
    const cambios = { ...entrada, instrucciones: entrada.instrucciones || null };
    await tx.update(t.mediosPago).set(cambios).where(eq(t.mediosPago.id, id));
    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "medio_pago",
      entidadId: id,
      accion: "modificacion",
      antes: { ...antes, ajustePorcentaje: antes.ajustePorcentaje.toString() },
      despues: { ...cambios, ajustePorcentaje: cambios.ajustePorcentaje.toString() },
    });
    return true;
  });
}

/** El alta suma lo que no cambia después: código, tipo y país. */
export const esquemaAltaMedioPago = esquemaMedioPago.extend({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,20}$/, { error: "De 2 a 20 letras, números o _" }),
  tipo: z.enum(TIPOS_MEDIO_PAGO, { error: "Elegí el tipo" }),
  /** Sin país: disponible en todos. */
  paisId: z.string().length(2).optional(),
});

export type EntradaAltaMedioPago = z.infer<typeof esquemaAltaMedioPago>;

export type ErrorAltaMedioPago = "CODIGO_EXISTENTE" | "PAIS_INEXISTENTE";

/** Da de alta un medio de pago al final de la lista y audita el alta. */
export async function crearMedioPago(
  db: Db,
  entrada: EntradaAltaMedioPago,
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: ErrorAltaMedioPago }> {
  return db.transaction(async (tx) => {
    const repetido = await tx.query.mediosPago.findFirst({
      columns: { id: true },
      where: eq(t.mediosPago.codigo, entrada.codigo),
    });
    if (repetido) return { ok: false, error: "CODIGO_EXISTENTE" };
    if (entrada.paisId) {
      const pais = await tx.query.paises.findFirst({
        columns: { id: true },
        where: eq(t.paises.id, entrada.paisId),
      });
      if (!pais) return { ok: false, error: "PAIS_INEXISTENTE" };
    }
    const [ultimo] = await tx
      .select({ orden: sql<number>`coalesce(max(${t.mediosPago.orden}), 0)::int` })
      .from(t.mediosPago);
    const valores = {
      ...entrada,
      ...caracteristicasDeTipo(entrada.tipo),
      paisId: entrada.paisId ?? null,
      instrucciones: entrada.instrucciones || null,
      orden: (ultimo?.orden ?? 0) + 1,
    };
    const [creado] = await tx
      .insert(t.mediosPago)
      .values(valores)
      .returning({ id: t.mediosPago.id });
    const id = creado?.id ?? "";
    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "medio_pago",
      entidadId: id,
      accion: "alta",
      despues: { ...valores, ajustePorcentaje: valores.ajustePorcentaje.toString() },
    });
    return { ok: true, id };
  });
}

/** Medios de pago activos, para elegir en un formulario. */
export function mediosPagoActivos(db: Ejecutor) {
  return db
    .select({ id: t.mediosPago.id, nombre: t.mediosPago.nombre })
    .from(t.mediosPago)
    .where(eq(t.mediosPago.activo, true))
    .orderBy(asc(t.mediosPago.orden));
}
