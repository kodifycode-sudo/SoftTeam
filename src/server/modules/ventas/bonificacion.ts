import { eq } from "drizzle-orm";
import { z } from "zod";
import { porcentaje } from "@/domain/dinero";
import { calcularOrden } from "@/domain/facturacion/calculo-orden";
import { condicionParaFacturar, type RechazoCondicion } from "@/domain/facturacion/impuestos";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { condicionFiscal } from "../catalogo/condiciones-iva";
import { registrarPago } from "./ordenes";

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

export type ErrorBonificacion =
  | "NO_EXISTE"
  | "ORDEN_NO_PENDIENTE"
  | "CON_TICKET"
  | "CALCULO"
  | RechazoCondicion;

/**
 * SOFTeam bonifica un paquete de una orden pendiente de pago: recalcula la
 * orden con el mismo motor de cálculo y vuelve a tomar la foto fiscal
 * (Mejora v2.1, 2.5): la condición frente al IVA vigente del cliente de
 * facturación y el ajuste vigente del medio de pago. Actualiza sus líneas y
 * contratos e invalida el link de pago (el importe cambió). No se combina con un ticket. Si es
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
    if (!contrato?.ordenId) return { ok: false, error: "NO_EXISTE" };
    const [orden] = await tx
      .select()
      .from(t.ordenes)
      .where(eq(t.ordenes.id, contrato.ordenId))
      .for("update");
    if (!orden) return { ok: false, error: "NO_EXISTE" };
    if (orden.estado !== "PEND_PAGO") return { ok: false, error: "ORDEN_NO_PENDIENTE" };
    if (orden.ticketId) return { ok: false, error: "CON_TICKET" };

    const [cliente, medio] = await Promise.all([
      tx.query.clientes.findFirst({
        columns: { condicionIva: true },
        where: eq(t.clientes.id, orden.clienteFacturacionId),
      }),
      tx.query.mediosPago.findFirst({
        columns: { ajustePorcentaje: true },
        where: eq(t.mediosPago.id, orden.medioPagoId),
      }),
    ]);
    const fiscal = condicionParaFacturar(
      cliente ? await condicionFiscal(tx, cliente.condicionIva) : undefined,
    );
    if (!fiscal.ok) return { ok: false, error: fiscal.error };
    const ajustePagoPorcentaje = medio?.ajustePorcentaje ?? orden.ajustePagoPorcentaje;

    const contratos = await tx
      .select()
      .from(t.contratos)
      .where(eq(t.contratos.ordenId, orden.id))
      .for("update");
    const calculo = calcularOrden({
      moneda: orden.moneda,
      // El precio de lista del contrato ya incluye la cantidad y el tramo
      // prorrateado: se toma entero, sin volver a dividirlo.
      items: contratos.map((c) => ({
        clave: c.id,
        paqueteId: c.paqueteId,
        tipoAccion: "ALTA" as const,
        cantidad: c.cantidad,
        precioCompra: c.precioLista,
        precioRenovacion: c.precioLista,
        precioListaResuelto: c.precioLista,
        bonifPorcentaje: c.id === entrada.contratoId ? entrada.porcentaje : c.bonifPorcentaje,
        moneda: orden.moneda,
      })),
      ajustePagoPorcentaje,
      alicuotaIva: fiscal.valor.alicuota,
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
        ajustePagoPorcentaje: k.ajustePagoPorcentaje,
        ajustePago: k.ajustePago,
        netoGravado: k.netoGravado,
        condicionIva: fiscal.valor.codigo,
        codigoArca: fiscal.valor.codigoArca,
        tipoComprobante: fiscal.valor.comprobante,
        alicuotaIva: k.alicuotaIva,
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
    // Bonificada al 100 %: no hay nada que cobrar ni facturar.
    if (k.total === 0n)
      await registrarPago(tx, orden.id, actorId, undefined, { actorTipo: "usuario" });
    return { ok: true, total: k.total };
  });
}
