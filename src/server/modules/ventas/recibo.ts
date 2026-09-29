import type { Ejecutor } from "@/server/db/cliente";
import { type AlcanceOrden, obtenerOrden } from "./ordenes";

/**
 * Recibo provisorio de una orden pagada: la constancia del pago con el
 * detalle de la orden hasta que se emite la factura (que se emite al cobrar).
 * No es un comprobante fiscal. Se numera con la orden ("R-10025"): hay uno
 * solo por orden.
 */
export async function obtenerRecibo(db: Ejecutor, ordenId: string, alcance: AlcanceOrden = {}) {
  const detalle = await obtenerOrden(db, ordenId, alcance);
  if (!detalle || detalle.orden.estado !== "PAGADA" || !detalle.orden.pagadaEn) return undefined;
  return {
    ...detalle,
    numeroRecibo: `R-${detalle.orden.numero}`,
    pagadoEn: detalle.orden.pagadaEn,
  };
}

export type Recibo = NonNullable<Awaited<ReturnType<typeof obtenerRecibo>>>;
