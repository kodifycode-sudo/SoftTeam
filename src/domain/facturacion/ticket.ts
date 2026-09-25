import type { Centavos, Porcentaje } from "../dinero";
import { esAnterior, esPosterior, type Fecha } from "../fecha";
import type { TipoCliente } from "../licencias/contrato";
import { exito, type Resultado, rechazo } from "../resultado";

export interface Ticket {
  readonly codigo: string;
  readonly activo: boolean;
  readonly porcentaje: Porcentaje;
  /** Tope total del descuento: funciona como saldo a lo largo de la serie. */
  readonly tope: Centavos;
  readonly vigenteDesde: Fecha;
  readonly vigenteHasta: Fecha;
  /** Vacío: aplica a cualquier paquete. */
  readonly paquetesHabilitados: readonly string[];
}

export type RechazoTicket =
  | "TICKET_INVALIDO"
  | "TICKET_VENCIDO"
  | "TICKET_AGOTADO"
  | "TICKET_CORPORATIVO"
  | "TICKET_SOBRE_BONIFICADO"
  | "TICKET_PAQUETE_NO_HABILITADO";

export interface TicketAplicable {
  readonly porcentaje: Porcentaje;
  readonly saldoDisponible: Centavos;
}

/**
 * Decide si un ticket se puede aplicar a una orden. El importe se calcula
 * después, en el motor de la orden: min(subtotal × %, saldo).
 */
export function evaluarTicket(entrada: {
  readonly ticket: Ticket | undefined;
  readonly hoy: Fecha;
  readonly tipoCliente: TipoCliente;
  readonly items: readonly { readonly paqueteId: string; readonly bonifPorcentaje: Porcentaje }[];
  /** Descuento ya usado por las órdenes no canceladas de la serie. */
  readonly consumidoSerie: Centavos;
}): Resultado<TicketAplicable, RechazoTicket> {
  const { ticket, hoy, items } = entrada;
  if (!ticket || !ticket.activo) return rechazo("TICKET_INVALIDO");
  if (esAnterior(hoy, ticket.vigenteDesde) || esPosterior(hoy, ticket.vigenteHasta)) {
    return rechazo("TICKET_VENCIDO");
  }
  // Las condiciones de los corporativos se negocian por contrato.
  if (entrada.tipoCliente === "CORPORATIVO") return rechazo("TICKET_CORPORATIVO");
  // No hay descuento sobre descuento.
  if (items.some((i) => i.bonifPorcentaje > 0n)) return rechazo("TICKET_SOBRE_BONIFICADO");
  if (
    ticket.paquetesHabilitados.length > 0 &&
    !items.every((i) => ticket.paquetesHabilitados.includes(i.paqueteId))
  ) {
    return rechazo("TICKET_PAQUETE_NO_HABILITADO");
  }
  const saldoDisponible = ticket.tope - entrada.consumidoSerie;
  if (saldoDisponible <= 0n) return rechazo("TICKET_AGOTADO");
  return exito({ porcentaje: ticket.porcentaje, saldoDisponible });
}
