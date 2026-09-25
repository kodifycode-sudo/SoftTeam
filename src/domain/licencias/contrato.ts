import { esAnterior, esPosterior, type Fecha, sumarDias, sumarMeses } from "../fecha";

/** Si el servicio se suspende por falta de pago (DIRECTO) o nunca (CORPORATIVO). */
export type TipoCliente = "DIRECTO" | "CORPORATIVO";

/** TEMPORAL vence por fecha. CONSUMIBLE vence al agotar su saldo. */
export type TipoPaquete = "TEMPORAL" | "CONSUMIBLE";

/**
 * Estado de pago del contrato. La vigencia NO es un estado: se calcula por
 * fechas (ver `estaVigente`), así la licencia es correcta a cualquier hora sin
 * depender de un proceso nocturno.
 */
export const ESTADOS_CONTRATO = [
  "PEND_PAGO",
  "PEND_PAGO_ACTIVO",
  "ACTIVO",
  "CANCELADO",
  "BAJA",
] as const;
export type EstadoContrato = (typeof ESTADOS_CONTRATO)[number];

const TRANSICIONES: Record<EstadoContrato, readonly EstadoContrato[]> = {
  // Pago confirmado, excepción de plazo otorgada o cancelación manual.
  PEND_PAGO: ["ACTIVO", "PEND_PAGO_ACTIVO", "CANCELADO"],
  // Pago confirmado o vencimiento de la excepción (proceso diario).
  PEND_PAGO_ACTIVO: ["ACTIVO", "PEND_PAGO", "CANCELADO"],
  ACTIVO: ["BAJA"],
  CANCELADO: [],
  BAJA: [],
};

export function puedeTransicionar(desde: EstadoContrato, hacia: EstadoContrato): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

/** Corporativos nacen habilitados sin límite: su servicio nunca se corta solo. */
export function estadoInicial(tipoCliente: TipoCliente): EstadoContrato {
  return tipoCliente === "CORPORATIVO" ? "PEND_PAGO_ACTIVO" : "PEND_PAGO";
}

export interface ContratoVigencia {
  readonly estado: EstadoContrato;
  readonly tipoPaquete: TipoPaquete;
  readonly desde: Fecha | null;
  readonly hasta: Fecha | null;
  /** Límite de la excepción de pago. `null` = sin límite (corporativos). */
  readonly pendPagoActivoHasta: Fecha | null;
  /** Para consumibles: saldo prepago restante. */
  readonly saldoRestante?: number;
}

/**
 * Un contrato suma a la licencia si:
 * - está ACTIVO, o PEND_PAGO_ACTIVO dentro de su plazo de excepción; y
 * - si es temporal, hoy está dentro del período `desde..hasta`;
 * - si es consumible, le queda saldo.
 *
 * PEND_PAGO_ACTIVO también exige estar dentro del período: si no, un contrato
 * corporativo impago de un período ya terminado sumaría para siempre, encima
 * de su renovación (licencia duplicada).
 */
export function estaVigente(c: ContratoVigencia, hoy: Fecha): boolean {
  const habilitado =
    c.estado === "ACTIVO" ||
    (c.estado === "PEND_PAGO_ACTIVO" &&
      (c.pendPagoActivoHasta === null || !esPosterior(hoy, c.pendPagoActivoHasta)));
  if (!habilitado) return false;

  if (c.tipoPaquete === "CONSUMIBLE") {
    return c.desde !== null && !esAnterior(hoy, c.desde) && (c.saldoRestante ?? 0) > 0;
  }
  return (
    c.desde !== null && c.hasta !== null && !esAnterior(hoy, c.desde) && !esPosterior(hoy, c.hasta)
  );
}

export interface Periodo {
  readonly desde: Fecha;
  readonly hasta: Fecha;
}

/** Período de `meses` meses que empieza en `desde`: termina el día anterior al aniversario. */
export function periodo(desde: Fecha, meses: number): Periodo {
  if (!Number.isInteger(meses) || meses < 1) throw new RangeError(`Meses inválidos: ${meses}`);
  return { desde, hasta: sumarDias(sumarMeses(desde, meses), -1) };
}

/**
 * Período de un alta: arranca el día en que se habilita (pago confirmado, o
 * confirmación de la orden si nace habilitado). Así un cliente DIRECTO no
 * pierde los días que tarda en pagar.
 */
export function periodoAlta(fechaHabilitacion: Fecha, meses: number): Periodo {
  return periodo(fechaHabilitacion, meses);
}

/** Período de una renovación: empalma con el anterior, sin huecos ni superposición. */
export function periodoRenovacion(hastaAnterior: Fecha, meses: number): Periodo {
  return periodo(sumarDias(hastaAnterior, 1), meses);
}
