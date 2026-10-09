import { type Fecha, sumarDias } from "../fecha";
import type { EstadoContrato } from "../licencias/contrato";

/**
 * Modo de facturación del cliente. Reemplaza al
 * tipo de cliente DIRECTO/CORPORATIVO. El comportamiento de cada modo es fijo;
 * la tolerancia de pago y los medios de pago habilitados son configurables.
 */
export const MODOS_FACTURACION = [0, 1, 2, 3] as const;
export type ModoFacturacion = (typeof MODOS_FACTURACION)[number];

export const NOMBRE_MODO: Record<ModoFacturacion, string> = {
  0: "Pago directo",
  1: "Factura adelantada",
  2: "Suscripción de Mercado Pago",
  3: "Factura agrupada con transferencia",
};

export const esModoFacturacion = (valor: number): valor is ModoFacturacion =>
  (MODOS_FACTURACION as readonly number[]).includes(valor);

/** Los modos 1 y 3 nacen habilitados (PEND_PAGO_ACTIVO); los 0 y 2 esperan el pago. */
export const estadoInicial = (modo: ModoFacturacion): EstadoContrato =>
  modo === 1 || modo === 3 ? "PEND_PAGO_ACTIVO" : "PEND_PAGO";

/** En los modos 1 y 3 la factura se emite al confirmar la orden, antes del pago. */
export const facturaAlConfirmar = (modo: ModoFacturacion) => modo === 1 || modo === 3;

/** Las condiciones comerciales del modo 3 se negocian con el agrupador: sin tickets. */
export const aceptaTicket = (modo: ModoFacturacion) => modo !== 3;

/** El modo 3 nunca se suspende: al vencer la tolerancia solo se avisa a SOFTeam. */
export const suspende = (modo: ModoFacturacion) => modo !== 3;

/** Plazo para pagar un alta habilitada sin pago: el modo 1 tiene tolerancia; el 3, sin límite. */
export function plazoDeAlta(modo: ModoFacturacion, tolerancia: number, hoy: Fecha): Fecha | null {
  return modo === 1 ? sumarDias(hoy, tolerancia) : null;
}

export interface PlazosRenovacion {
  /** Hasta cuándo el contrato anterior sigue sumando (PRORROGADO). `null`: sin prórroga. */
  readonly prorrogaAnterior: Fecha | null;
  /** Plazo del contrato nuevo habilitado sin pago. `null`: sin límite o no aplica. */
  readonly pendPagoActivoHasta: Fecha | null;
}

/**
 * Tolerancia de pago de una renovación pendiente. Las fechas de
 * facturación no cambian: la renovación empieza siempre al día siguiente del
 * vencimiento anterior.
 * - Modos 0 y 2: el contrato anterior sigue sumando (prórroga) hasta su
 *   vencimiento + tolerancia; el nuevo espera el pago.
 * - Modo 1: el contrato nuevo nace habilitado hasta su inicio + tolerancia.
 * - Modo 3: el contrato nuevo nace habilitado sin límite.
 */
export function plazosDeRenovacion(
  modo: ModoFacturacion,
  tolerancia: number,
  hastaAnterior: Fecha,
  desdeNuevo: Fecha,
): PlazosRenovacion {
  if (modo === 0 || modo === 2) {
    return { prorrogaAnterior: sumarDias(hastaAnterior, tolerancia), pendPagoActivoHasta: null };
  }
  if (modo === 1) {
    return { prorrogaAnterior: null, pendPagoActivoHasta: sumarDias(desdeNuevo, tolerancia) };
  }
  return { prorrogaAnterior: null, pendPagoActivoHasta: null };
}

/** Medios de pago: cada medio declara con qué modos se puede usar. */
export const medioPermitidoParaModo = (modosDelMedio: readonly number[], modo: ModoFacturacion) =>
  modosDelMedio.includes(modo);
