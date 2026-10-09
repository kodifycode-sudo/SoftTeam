import { eq } from "drizzle-orm";
import { z } from "zod";
import { fecha as aFecha, esAnterior } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { registrarCambioEmpresa } from "../integraciones/eventos";

const fecha = z.iso.date({ error: "Elegí una fecha." }).transform(aFecha);

export const esquemaPlazosContrato = z.object({
  contratoId: z.uuid(),
  /** Contrato ACTIVO: hasta cuándo sigue sumando después de vencer. Vacío: sin prórroga. */
  prorrogaHasta: fecha.optional(),
  /** Contrato habilitado sin pago: plazo para pagar. Vacío: sin límite. */
  pendPagoActivoHasta: fecha.optional(),
  motivo: z.string().trim().min(5, { error: "Contá el motivo (queda en la auditoría)." }).max(300),
});

export type EntradaPlazosContrato = z.infer<typeof esquemaPlazosContrato>;
export type ErrorPlazosContrato = "NO_EXISTE" | "ESTADO_INVALIDO" | "PRORROGA_ANTERIOR";

/**
 * Administración extiende o acorta la tolerancia de pago de un contrato
 * (Mejora v2.1, 7.7): la prórroga de un contrato activo cuya renovación está
 * impaga, o el plazo de uno habilitado sin pago. Rige en el acto para la
 * licencia y queda auditado con su motivo.
 */
export async function guardarPlazosContrato(
  db: Db,
  entrada: EntradaPlazosContrato,
  actorId: string,
): Promise<{ ok: true; empresaId: string } | { ok: false; error: ErrorPlazosContrato }> {
  return db.transaction(async (tx) => {
    const [contrato] = await tx
      .select()
      .from(t.contratos)
      .where(eq(t.contratos.id, entrada.contratoId))
      .for("update");
    if (!contrato) return { ok: false, error: "NO_EXISTE" };

    const cambios =
      contrato.estado === "ACTIVO"
        ? { prorrogaHasta: entrada.prorrogaHasta ?? null }
        : contrato.estado === "PEND_PAGO_ACTIVO"
          ? { pendPagoActivoHasta: entrada.pendPagoActivoHasta ?? null }
          : undefined;
    if (!cambios) return { ok: false, error: "ESTADO_INVALIDO" };
    if (
      "prorrogaHasta" in cambios &&
      cambios.prorrogaHasta &&
      contrato.hasta &&
      esAnterior(cambios.prorrogaHasta, contrato.hasta)
    ) {
      return { ok: false, error: "PRORROGA_ANTERIOR" };
    }

    await tx.update(t.contratos).set(cambios).where(eq(t.contratos.id, contrato.id));
    await registrarCambioEmpresa(tx, [contrato.empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "contrato",
      entidadId: contrato.id,
      empresaId: contrato.empresaId,
      accion: "plazos",
      antes: {
        prorrogaHasta: contrato.prorrogaHasta,
        pendPagoActivoHasta: contrato.pendPagoActivoHasta,
      },
      despues: cambios,
      motivo: entrada.motivo,
    });
    return { ok: true, empresaId: contrato.empresaId };
  });
}
