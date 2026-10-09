import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { porcentaje } from "@/domain/dinero";
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
  /** Modos de facturación con que se puede usar (Mejora v2.1, 6.5). */
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

/** Medios de pago activos, para elegir en un formulario. */
export function mediosPagoActivos(db: Ejecutor) {
  return db
    .select({ id: t.mediosPago.id, nombre: t.mediosPago.nombre })
    .from(t.mediosPago)
    .where(eq(t.mediosPago.activo, true))
    .orderBy(asc(t.mediosPago.orden));
}
