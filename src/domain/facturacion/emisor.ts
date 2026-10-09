import { exito, type Resultado, rechazo } from "../resultado";
import type { TipoMedioPago } from "./medio-pago";

/**
 * Emisor: sociedad de SOFTeam que factura (Mejora v2.1, 5.11). Cada cliente
 * tiene uno; la orden lo congela con su CUIT y su razón social, y todo lo que
 * va a Mercado Pago y a la factura usa la cuenta de ese emisor.
 */
export interface EmisorParaVenta {
  readonly id: string;
  readonly activo: boolean;
  /** Tiene conexión con Mercado Pago: sin ella no se ofrecen sus medios. */
  readonly mercadoPago: boolean;
}

const MEDIOS_MERCADO_PAGO: readonly TipoMedioPago[] = ["LINK_MP", "SUSCRIPCION_MP"];

/** Los medios que dependen de Mercado Pago solo se ofrecen si el emisor tiene conexión. */
export const medioDisponibleParaEmisor = (tipo: TipoMedioPago, emisor: EmisorParaVenta) =>
  emisor.mercadoPago || !MEDIOS_MERCADO_PAGO.includes(tipo);

/**
 * Emisor de una venta: el del cliente al que se factura o, si no tiene, el
 * preferido de su país. Sin emisor activo no se puede vender.
 */
export function resolverEmisor<E extends EmisorParaVenta>(
  delCliente: E | undefined,
  preferidoDelPais: E | undefined,
): Resultado<E, "SIN_EMISOR"> {
  const emisor = delCliente?.activo ? delCliente : preferidoDelPais;
  return emisor?.activo ? exito(emisor) : rechazo("SIN_EMISOR");
}

/**
 * Número de una factura emitida fuera del sistema (emisor sin Xubio):
 * tipo, punto de venta y número ("A-0001-00001234").
 */
export const NUMERO_FACTURA_MANUAL = /^[ABE]-\d{4,5}-\d{8}$/;
