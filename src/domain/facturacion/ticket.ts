import type { Centavos, Porcentaje } from "../dinero";
import { esAnterior, esPosterior, type Fecha, sumarMeses } from "../fecha";
import { exito, type Resultado, rechazo } from "../resultado";
import type { TipoAccion } from "./calculo-orden";
import { aceptaTicket, type ModoFacturacion } from "./modo";

/** Cuántas veces se puede usar. */
export type UsoTicket = "UNICO_X_CLIENTE" | "UNICO_ABSOLUTO" | "MULTIPLE";
export const USOS_TICKET: readonly UsoTicket[] = ["UNICO_X_CLIENTE", "UNICO_ABSOLUTO", "MULTIPLE"];

export interface Ticket {
  readonly codigo: string;
  readonly activo: boolean;
  readonly porcentaje: Porcentaje;
  /** Descuento máximo acumulado en la serie de órdenes (0 = sin tope). */
  readonly tope: Centavos;
  readonly vigenteDesde: Fecha;
  readonly vigenteHasta: Fecha;
  /** Vacío: aplica a cualquier paquete. */
  readonly paquetesHabilitados: readonly string[];
  readonly uso: UsoTicket;
  /** Solo para MULTIPLE: usos en total (0 = sin límite). */
  readonly usosMaximos: number;
  /** Subtotal mínimo de la orden (0 = sin mínimo). */
  readonly minimo: Centavos;
  readonly moneda: string;
  /** `null`: cualquier país. */
  readonly paisId: string | null;
  /** Ticket nominado a un cliente. `null`: cualquiera. */
  readonly clienteId: string | null;
  readonly altaInicial: boolean;
  readonly adicional: boolean;
  readonly renovacion: boolean;
  /** `false`: solo lo aplica SOFTeam. */
  readonly publico: boolean;
}

export type RechazoTicket =
  | "TICKET_INVALIDO"
  | "TICKET_VENCIDO"
  | "TICKET_NO_PUBLICO"
  | "TICKET_CORPORATIVO"
  | "TICKET_SOBRE_BONIFICADO"
  | "TICKET_OTRA_MONEDA"
  | "TICKET_OTRO_PAIS"
  | "TICKET_OTRO_CLIENTE"
  | "TICKET_PAQUETE_NO_HABILITADO"
  | "TICKET_INSTANCIA_NO_HABILITADA"
  | "TICKET_MINIMO"
  | "TICKET_SIN_USOS"
  | "TICKET_AGOTADO";

export interface TicketAplicable {
  readonly porcentaje: Porcentaje;
  /** El descuento de la orden no supera este importe (`null`: sin tope). */
  readonly tope: Centavos | null;
}

/** Saldo del tope: lo que queda después de lo descontado en la serie (`null`: sin tope). */
export function saldoDeTicket(tope: Centavos, consumido: Centavos): Centavos | null {
  if (tope === 0n) return null;
  return (tope > consumido ? tope - consumido : 0n) as Centavos;
}

/**
 * Valida un ticket aplicado a mano, desde el carrito o la orden manual de
 * SOFTeam. El importe se calcula después, en el
 * motor de la orden: min(subtotal × %, saldo del tope).
 *
 * `usos`: órdenes manuales no canceladas que ya lo usaron, contadas según su
 * tipo de uso (las renovaciones de la serie son continuidad, no usos nuevos).
 */
export function evaluarTicket(entrada: {
  readonly ticket: Ticket | undefined;
  readonly hoy: Fecha;
  /** Del cliente de facturación. */
  readonly modoFacturacion: ModoFacturacion;
  readonly items: readonly {
    readonly paqueteId: string;
    readonly tipoAccion: TipoAccion;
    readonly bonifPorcentaje: Porcentaje;
  }[];
  readonly contexto: {
    /** El que aplica es un rol SOFTeam. */
    readonly softeam: boolean;
    readonly clienteId: string;
    readonly paisId: string;
    readonly moneda: string;
    /** Las altas de la orden son el primer alta del cliente. */
    readonly altaInicial: boolean;
    /** Subtotal de la orden antes del ticket. */
    readonly subtotal: Centavos;
  };
  readonly usos: number;
  /** Saldo del tope; en un ticket nuevo para la serie, el tope entero. */
  readonly saldo: Centavos | null;
}): Resultado<TicketAplicable, RechazoTicket> {
  const { ticket, hoy, items, contexto } = entrada;
  if (!ticket || !ticket.activo) return rechazo("TICKET_INVALIDO");
  if (esAnterior(hoy, ticket.vigenteDesde) || esPosterior(hoy, ticket.vigenteHasta)) {
    return rechazo("TICKET_VENCIDO");
  }
  if (!ticket.publico && !contexto.softeam) return rechazo("TICKET_NO_PUBLICO");
  // Las condiciones de la factura agrupada se negocian con el agrupador.
  if (!aceptaTicket(entrada.modoFacturacion)) return rechazo("TICKET_CORPORATIVO");
  // No hay descuento sobre descuento.
  if (items.some((i) => i.bonifPorcentaje > 0n)) return rechazo("TICKET_SOBRE_BONIFICADO");
  if (ticket.moneda !== contexto.moneda) return rechazo("TICKET_OTRA_MONEDA");
  if (ticket.paisId !== null && ticket.paisId !== contexto.paisId) {
    return rechazo("TICKET_OTRO_PAIS");
  }
  if (ticket.clienteId !== null && ticket.clienteId !== contexto.clienteId) {
    return rechazo("TICKET_OTRO_CLIENTE");
  }
  if (
    ticket.paquetesHabilitados.length > 0 &&
    !items.every((i) => ticket.paquetesHabilitados.includes(i.paqueteId))
  ) {
    return rechazo("TICKET_PAQUETE_NO_HABILITADO");
  }
  const hayAltas = items.some((i) => i.tipoAccion === "ALTA");
  const hayRenovaciones = items.some((i) => i.tipoAccion === "RENOVACION");
  if (
    (hayAltas && !(contexto.altaInicial ? ticket.altaInicial : ticket.adicional)) ||
    (hayRenovaciones && !ticket.renovacion)
  ) {
    return rechazo("TICKET_INSTANCIA_NO_HABILITADA");
  }
  if (contexto.subtotal < ticket.minimo) return rechazo("TICKET_MINIMO");
  const limite =
    ticket.uso === "MULTIPLE" ? (ticket.usosMaximos > 0 ? ticket.usosMaximos : null) : 1;
  if (limite !== null && entrada.usos >= limite) return rechazo("TICKET_SIN_USOS");
  if (entrada.saldo !== null && entrada.saldo <= 0n) return rechazo("TICKET_AGOTADO");
  return exito({ porcentaje: ticket.porcentaje, tope: entrada.saldo });
}

/**
 * Herencia en la serie de renovaciones: sin revalidar, mientras no
 * pasen 12 meses desde la orden de origen y quede saldo del tope.
 */
export function ticketHeredable(entrada: {
  readonly emitidaOrigen: Fecha;
  readonly hoy: Fecha;
  readonly saldo: Centavos | null;
}): boolean {
  return (
    !esPosterior(entrada.hoy, sumarMeses(entrada.emitidaOrigen, 12)) &&
    (entrada.saldo === null || entrada.saldo > 0n)
  );
}
