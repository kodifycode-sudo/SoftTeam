import type { Centavos, Porcentaje } from "../dinero";
import { esAnterior, esPosterior, type Fecha } from "../fecha";
import type { TipoCliente } from "../licencias/contrato";
import { exito, type Resultado, rechazo } from "../resultado";
import type { TipoAccion } from "./calculo-orden";

export interface Ticket {
  readonly codigo: string;
  readonly activo: boolean;
  readonly porcentaje: Porcentaje;
  /** Descuento máximo en una misma compra. */
  readonly tope: Centavos;
  readonly vigenteDesde: Fecha;
  readonly vigenteHasta: Fecha;
  /** Vacío: aplica a cualquier paquete. */
  readonly paquetesHabilitados: readonly string[];
}

export type RechazoTicket =
  | "TICKET_INVALIDO"
  | "TICKET_VENCIDO"
  | "TICKET_CORPORATIVO"
  | "TICKET_SOLO_PAQUETES_NUEVOS"
  | "TICKET_SOBRE_BONIFICADO"
  | "TICKET_PAQUETE_NO_HABILITADO";

export interface TicketAplicable {
  readonly porcentaje: Porcentaje;
  /** El descuento de la compra no supera este importe. */
  readonly tope: Centavos;
}

/**
 * Decide si un ticket se puede aplicar a una compra. El importe se calcula
 * después, en el motor de la orden: min(subtotal × %, tope).
 *
 * Los tickets son para paquetes nuevos: no aplican a renovaciones (ni a la
 * automática ni a una renovación comprada a mano).
 */
export function evaluarTicket(entrada: {
  readonly ticket: Ticket | undefined;
  readonly hoy: Fecha;
  readonly tipoCliente: TipoCliente;
  readonly items: readonly {
    readonly paqueteId: string;
    readonly tipoAccion: TipoAccion;
    readonly bonifPorcentaje: Porcentaje;
  }[];
}): Resultado<TicketAplicable, RechazoTicket> {
  const { ticket, hoy, items } = entrada;
  if (!ticket || !ticket.activo) return rechazo("TICKET_INVALIDO");
  if (esAnterior(hoy, ticket.vigenteDesde) || esPosterior(hoy, ticket.vigenteHasta)) {
    return rechazo("TICKET_VENCIDO");
  }
  // Las condiciones de los corporativos se negocian por contrato.
  if (entrada.tipoCliente === "CORPORATIVO") return rechazo("TICKET_CORPORATIVO");
  if (items.some((i) => i.tipoAccion === "RENOVACION")) {
    return rechazo("TICKET_SOLO_PAQUETES_NUEVOS");
  }
  // No hay descuento sobre descuento.
  if (items.some((i) => i.bonifPorcentaje > 0n)) return rechazo("TICKET_SOBRE_BONIFICADO");
  if (
    ticket.paquetesHabilitados.length > 0 &&
    !items.every((i) => ticket.paquetesHabilitados.includes(i.paqueteId))
  ) {
    return rechazo("TICKET_PAQUETE_NO_HABILITADO");
  }
  return exito({ porcentaje: ticket.porcentaje, tope: ticket.tope });
}
