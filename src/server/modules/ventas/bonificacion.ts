import { eq } from "drizzle-orm";
import { z } from "zod";
import { porcentaje } from "@/domain/dinero";
import { calcularOrden } from "@/domain/facturacion/calculo-orden";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

export const esquemaBonificacion = z.object({
  contratoId: z.uuid(),
  /** Porcentaje con hasta dos decimales ("10" o "12,5"). */
  porcentaje: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) >= 0 && Number(v) <= 100, {
      error: "Un porcentaje entre 0 y 100 (hasta dos decimales).",
    })
    .transform((v) => porcentaje(v)),
  recurrente: z.boolean(),
  motivo: z.string().trim().min(5, { error: "Contá el motivo (queda en la auditoría)." }).max(200),
});

export type EntradaBonificacion = z.infer<typeof esquemaBonificacion>;

export type ErrorBonificacion = "NO_EXISTE" | "ORDEN_NO_PENDIENTE" | "CON_TICKET" | "CALCULO";

/**
 * SOFTeam bonifica un paquete de una orden pendiente de pago: recalcula la
 * orden con el mismo motor de cálculo (con el ajuste del medio de pago y el
 * IVA que la orden congeló), actualiza sus líneas y contratos e invalida el
 * link de pago (el importe cambió). No se combina con un ticket. Si es
 * recurrente, la renovación la conserva. Una bonificación de 0 la quita.
 */
export async function bonificarContrato(
  db: Db,
  entrada: EntradaBonificacion,
  actorId: string,
): Promise<{ ok: true; total: bigint } | { ok: false; error: ErrorBonificacion }> {
  return db.transaction(async (tx) => {
    const contrato = await tx.query.contratos.findFirst({
      columns: { id: true, ordenId: true },
      where: eq(t.contratos.id, entrada.contratoId),
    });
    if (!contrato) return { ok: false, error: "NO_EXISTE" };
    const [orden] = await tx
      .select()
      .from(t.ordenes)
      .where(eq(t.ordenes.id, contrato.ordenId))
      .for("update");
    if (!orden) return { ok: false, error: "NO_EXISTE" };
    if (orden.estado !== "PEND_PAGO") return { ok: false, error: "ORDEN_NO_PENDIENTE" };
    if (orden.ticketId) return { ok: false, error: "CON_TICKET" };

    const contratos = await tx
      .select()
      .from(t.contratos)
      .where(eq(t.contratos.ordenId, orden.id))
      .for("update");
    const calculo = calcularOrden({
      moneda: orden.moneda,
      items: contratos.map((c) => {
        // El precio de lista del contrato es unitario × cantidad.
        const unitario = c.precioLista / BigInt(c.cantidad);
        return {
          clave: c.id,
          paqueteId: c.paqueteId,
          tipoAccion: "ALTA" as const,
          cantidad: c.cantidad,
          precioCompra: unitario,
          precioRenovacion: unitario,
          bonifPorcentaje: c.id === entrada.contratoId ? entrada.porcentaje : c.bonifPorcentaje,
          moneda: orden.moneda,
        };
      }),
      ajustePagoPorcentaje: orden.ajustePagoPorcentaje,
      alicuotaIva: orden.alicuotaIva,
    });
    if (!calculo.ok) return { ok: false, error: "CALCULO" };
    const k = calculo.valor;

    const bonificado = entrada.porcentaje > 0n;
    for (const item of k.items) {
      const esEste = item.clave === entrada.contratoId;
      await tx
        .update(t.contratos)
        .set({
          precioFinal: item.precioFinal,
          ...(esEste
            ? {
                bonifPorcentaje: entrada.porcentaje,
                bonifRecurrente: bonificado && entrada.recurrente,
                bonifMotivo: bonificado ? entrada.motivo : null,
              }
            : {}),
        })
        .where(eq(t.contratos.id, item.clave));
      await tx
        .update(t.ordenItems)
        .set({
          precioLista: item.precioLista,
          bonificacion: item.bonificacion,
          precioFinal: item.precioFinal,
          totalProrrateado: item.totalProrrateado,
        })
        .where(eq(t.ordenItems.contratoId, item.clave));
    }
    await tx
      .update(t.ordenes)
      .set({
        subtotalLista: k.subtotalLista,
        bonificacionTotal: k.bonificacionTotal,
        subtotal: k.subtotal,
        baseNeta: k.baseNeta,
        ajustePago: k.ajustePago,
        netoGravado: k.netoGravado,
        iva: k.iva,
        total: k.total,
        // El link de pago era por el importe anterior.
        linkPagoUrl: null,
        mpPreferenciaId: null,
        version: orden.version + 1,
      })
      .where(eq(t.ordenes.id, orden.id));
    await auditar(tx, {
      actorId,
      entidad: "orden",
      entidadId: orden.id,
      empresaId: orden.empresaId ?? undefined,
      accion: "bonificacion",
      antes: {
        total: orden.total.toString(),
        bonificacion: contratos
          .find((c) => c.id === entrada.contratoId)
          ?.bonifPorcentaje.toString(),
      },
      despues: {
        total: k.total.toString(),
        contratoId: entrada.contratoId,
        bonificacion: entrada.porcentaje.toString(),
        recurrente: bonificado && entrada.recurrente,
        motivo: entrada.motivo,
      },
    });
    return { ok: true, total: k.total };
  });
}
