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
    case "YA_RENOVADO":
      return `${detalle ?? "Un paquete"} ya tiene su renovación generada. Quitalo del carrito para continuar.`;
    case "SIN_EMISOR":
      return "Por ahora no podemos tomar tu compra. Escribinos y lo resolvemos.";
    case "IVA_COND_INVALIDA":
    case "COMP_NO_HABILITADO":
      return "Falta definir tu condición frente al IVA para facturarte. Escribinos y lo resolvemos.";
    case "PLAN_NO_PERMITIDO":
      return `${detalle ?? "Un paquete"}: el primer alta es por un trimestre y, a partir de ahí, se contrata mensual o anual. Quitalo y elegí la opción que corresponde.`;
    case "DIA_INVALIDO":
      return "Ese día de vencimiento no está disponible. Elegí otro.";
    case "ITEM_NO_DISPONIBLE":
      return `${detalle ?? "Un paquete"} ya no está a la venta. Quitalo del carrito para continuar.`;
    default:
      return "No pudimos preparar la orden. Probá de nuevo o escribinos.";
  }
}

export const esRechazoDeTicket = (error: string) => error.startsWith("TICKET_");
