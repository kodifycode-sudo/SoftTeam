import {
  aplicarPorcentaje,
  type Centavos,
  maximo,
  minimo,
  type Porcentaje,
  sumar,
} from "../dinero";
import { prorratear } from "../prorrateo";
import { exito, type Resultado, rechazo } from "../resultado";
import type { TicketAplicable } from "./ticket";

export type TipoAccion = "ALTA" | "RENOVACION";

export interface ItemEntrada {
  /** Identificador del ítem para el llamador (id de carrito o de contrato). */
  readonly clave: string;
  readonly paqueteId: string;
  readonly tipoAccion: TipoAccion;
  /** Unidades: multiplican el precio (y los límites), nunca la duración. */
  readonly cantidad: number;
  readonly precioCompra: Centavos;
  readonly precioRenovacion: Centavos;
  readonly bonifPorcentaje: Porcentaje;
  readonly moneda: string;
  /** Tramo prorrateado hasta el día de vencimiento, ya por la cantidad. */
  readonly prorrata?: Centavos;
  /** `false`: el ítem cobra solo el tramo (altas de adicionales y de grupo). */
  readonly incluyePeriodo?: boolean;
  /**
   * Precio de lista ya grabado en el contrato (cantidad y tramo incluidos):
   * al recalcular una orden existente se toma tal cual.
   */
  readonly precioListaResuelto?: Centavos;
}

export interface EntradaCalculo {
  /** Moneda de la empresa (de su país). */
  readonly moneda: string;
  readonly items: readonly ItemEntrada[];
  readonly ajustePagoPorcentaje: Porcentaje;
  readonly alicuotaIva: Porcentaje;
  /** Solo si `evaluarTicket` lo aprobó. */
  readonly ticket?: TicketAplicable | undefined;
}

export interface ItemCalculado {
  readonly clave: string;
  readonly precioLista: Centavos;
  readonly bonificacion: Centavos;
  readonly precioFinal: Centavos;
  /** Parte del total final atribuible al ítem. La suma de los ítems da el total. */
  readonly totalProrrateado: Centavos;
}

export interface CalculoOrden {
  readonly items: readonly ItemCalculado[];
  readonly subtotalLista: Centavos;
  readonly bonificacionTotal: Centavos;
  /** Suma de precios finales (después de la bonificación de paquete). */
  readonly subtotal: Centavos;
  readonly ticketPorcentaje: Porcentaje;
  readonly ticketDescuento: Centavos;
  readonly baseNeta: Centavos;
  readonly ajustePagoPorcentaje: Porcentaje;
  readonly ajustePago: Centavos;
  readonly netoGravado: Centavos;
  readonly alicuotaIva: Porcentaje;
  readonly iva: Centavos;
  readonly total: Centavos;
}

export type RechazoCalculo =
  | "SIN_ITEMS"
  | "MONEDA_INCONSISTENTE"
  | "CANTIDAD_INVALIDA"
  | "BONIFICACION_INVALIDA";

/**
 * Cascada de cálculo de una orden. Función pura y determinista: es el único
 * lugar del sistema donde está escrita la fórmula (la usan carrito, orden y
 * renovación). Redondea en cada paso, a centavos.
 *
 *   subtotal    = Σ (lista − bonificación)
 *   baseNeta    = max(subtotal − ticket, 0)
 *   netoGravado = baseNeta + ajuste por medio de pago
 *   total       = netoGravado + IVA
 */
export function calcularOrden(entrada: EntradaCalculo): Resultado<CalculoOrden, RechazoCalculo> {
  if (entrada.items.length === 0) return rechazo("SIN_ITEMS");

  for (const item of entrada.items) {
    if (item.moneda !== entrada.moneda) return rechazo("MONEDA_INCONSISTENTE", item.clave);
    if (!Number.isInteger(item.cantidad) || item.cantidad < 1) {
      return rechazo("CANTIDAD_INVALIDA", item.clave);
    }
    if (item.bonifPorcentaje < 0n || item.bonifPorcentaje > 10_000n) {
      return rechazo("BONIFICACION_INVALIDA", item.clave);
    }
  }

  const lineas = entrada.items.map((item) => {
    const unitario = item.tipoAccion === "ALTA" ? item.precioCompra : item.precioRenovacion;
    // La bonificación alcanza también al tramo.
    const precioLista =
      item.precioListaResuelto ??
      (item.incluyePeriodo === false ? 0n : unitario * BigInt(item.cantidad)) +
        (item.prorrata ?? 0n);
    const bonificacion = aplicarPorcentaje(precioLista, item.bonifPorcentaje);
    return {
      clave: item.clave,
      precioLista,
      bonificacion,
      precioFinal: precioLista - bonificacion,
    };
  });

  const subtotal = sumar(lineas.map((l) => l.precioFinal));
  const ticketPorcentaje = entrada.ticket?.porcentaje ?? 0n;
  const ticketDescuento = entrada.ticket
    ? entrada.ticket.tope === null
      ? aplicarPorcentaje(subtotal, ticketPorcentaje)
      : minimo(aplicarPorcentaje(subtotal, ticketPorcentaje), entrada.ticket.tope)
    : 0n;
  const baseNeta = maximo(subtotal - ticketDescuento, 0n);
  const ajustePago = aplicarPorcentaje(baseNeta, entrada.ajustePagoPorcentaje);
  const netoGravado = baseNeta + ajustePago;
  const iva = aplicarPorcentaje(netoGravado, entrada.alicuotaIva);
  const total = netoGravado + iva;

  const partes = prorratear(
    maximo(total, 0n),
    lineas.map((l) => l.precioFinal),
  );

  return exito({
    items: lineas.map((l, i) => ({ ...l, totalProrrateado: partes[i] as Centavos })),
    subtotalLista: sumar(lineas.map((l) => l.precioLista)),
    bonificacionTotal: sumar(lineas.map((l) => l.bonificacion)),
    subtotal,
    ticketPorcentaje,
    ticketDescuento,
    baseNeta,
    ajustePagoPorcentaje: entrada.ajustePagoPorcentaje,
    ajustePago,
    netoGravado,
    alicuotaIva: entrada.alicuotaIva,
    iva,
    total,
  });
}
