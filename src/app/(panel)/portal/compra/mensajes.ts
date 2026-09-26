import type { RechazoCompra } from "@/server/modules/ventas/checkout";

/**
 * Mensajes para el cliente. Los rechazos de ticket se muestran siempre con
 * un texto genérico: el motivo detallado queda para los roles SOFTeam.
 */
export function mensajeRechazoCompra(error: RechazoCompra, detalle?: string): string {
  if (error === "TICKET_SOLO_PAQUETES_NUEVOS") {
    return "Los códigos de descuento son para paquetes nuevos: no aplican a renovaciones.";
  }
  if (error.startsWith("TICKET_")) return "El código no es válido o no aplica a esta orden.";
  switch (error) {
    case "SIN_ITEMS":
      return "Tu carrito está vacío.";
    case "MEDIO_NO_HABILITADO":
      return "Ese medio de pago no está disponible para esta compra. Elegí otro.";
    case "ITEM_NO_DISPONIBLE":
      return `${detalle ?? "Un paquete"} ya no está a la venta. Quitalo del carrito para continuar.`;
    default:
      return "No pudimos preparar la orden. Probá de nuevo o escribinos.";
  }
}

export const esRechazoDeTicket = (error: string) => error.startsWith("TICKET_");
