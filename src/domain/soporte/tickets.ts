/*
 * Qué pedidos de soporte usan un ticket de la licencia. Los tickets pagan el
 * soporte técnico de los productos; las consultas sobre la propia cuenta
 * (licencias, pagos, facturación: el producto "stlic") no usan ticket, así
 * un cliente sin tickets igual puede preguntar por una factura o un pago.
 */

/** Productos de soporte cuyas consultas no usan ticket. */
export const PRODUCTOS_SIN_TICKET: readonly string[] = ["stlic"];

export function usaTicket(producto: string): boolean {
  return !PRODUCTOS_SIN_TICKET.includes(producto);
}
