import type { Centavos } from "../dinero";
import { diasEntre, esPosterior, type Fecha, sumarDias, sumarMeses } from "../fecha";
import { periodo } from "./contrato";

/*
 * Período y tramo prorrateado de un paquete temporal. Los vencimientos se alinean a un día fijo del mes (10 o 20): el
 * período que falta hasta esa fecha se cobra proporcional a los días. Es el
 * único lugar donde se calcula; no lee la base.
 */

/** Duración del plan en meses. El trimestral es solo el alta inicial. */
export const DURACIONES_PLAN = [1, 3, 12] as const;
export const TRIMESTRAL_INICIAL = 3;

export type TipoCalculoPeriodo = "RENOVACION" | "ALTA_ADICIONAL" | "ALTA_GRUPO";

export interface EntradaPeriodo {
  tipo: TipoCalculoPeriodo;
  /** Inicio del paquete. En renovaciones, el día siguiente al vencimiento anterior. */
  desde: Fecha;
  /** Día de vencimiento (10 o 20). `null`: trimestre inicial, sin alinear. */
  diaVenc: number | null;
  /** Hoy en el carrito; la fecha de la corrida en la renovación automática. */
  fechaEmision: Fecha;
  meses: number;
  /** Precio del período completo (de la alternativa, por la cantidad). */
  precioLista: Centavos;
  /** Tramo mínimo en renovaciones: si da menos, se alinea al mes siguiente. */
  minDiasTramo: number;
  /**
   * Altas: el mayor vencimiento de los paquetes del cliente (o del grupo) con
   * ese día. El tramo llega hasta ahí, para terminar junto con lo que ya tiene.
   */
  mayorHasta?: Fecha | null;
  /** Alta inicial a un grupo: día de la corrida colectiva (DiaCorte1). */
  diaCorteColectiva?: number;
}

export interface PeriodoCalculado {
  /** Fin del tramo prorrateado. `null`: sin alineación (período completo). */
  fechaObjetivo: Fecha | null;
  prorrataDias: number;
  prorrataImporte: Centavos;
  /** Renovaciones: cobra tramo más período. Altas: solo el tramo. */
  incluyePeriodo: boolean;
  hasta: Fecha;
}

const diaDe = (f: Fecha) => Number(f.slice(8, 10));
const conDia = (f: Fecha, d: number) => `${f.slice(0, 8)}${String(d).padStart(2, "0")}` as Fecha;

/** Primera fecha con ese día del mes que no sea anterior a `minimo`. */
export function proximoDia(minimo: Fecha, dia: number): Fecha {
  const candidata = conDia(minimo, dia);
  return esPosterior(minimo, candidata) ? conDia(sumarMeses(candidata, 1), dia) : candidata;
}

const mayor = (a: Fecha, b: Fecha) => (esPosterior(a, b) ? a : b);

/** Divisor de la prorrata: 365 si el plan es anual; 30 por mes en otro caso. */
const divisor = (meses: number) => BigInt(meses === 12 ? 365 : 30 * meses);

/** Precio × días / divisor, redondeado a centavos (mitad hacia arriba). */
function prorrata(precio: Centavos, dias: number, meses: number): Centavos {
  if (dias <= 0) return 0n as Centavos;
  const d = divisor(meses);
  return ((precio * BigInt(dias) * 2n + d) / (2n * d)) as Centavos;
}

function fechaObjetivo(e: EntradaPeriodo): Fecha | null {
  if (e.tipo === "RENOVACION") {
    if (e.diaVenc === null) throw new RangeError("La renovación necesita el día de vencimiento");
    const anterior = sumarDias(e.desde, -1);
    // Ya alineado y generado con anticipación: sin tramo.
    if (esPosterior(e.desde, e.fechaEmision) && diaDe(anterior) === e.diaVenc) return anterior;
    // Si se acuerda tarde, el tramo cubre todo lo transcurrido desde el vencimiento.
    return proximoDia(mayor(sumarDias(e.desde, e.minDiasTramo - 1), e.fechaEmision), e.diaVenc);
  }
  if (e.mayorHasta) return e.mayorHasta;
  if (e.diaVenc === null) return null;
  if (e.tipo === "ALTA_ADICIONAL") return proximoDia(e.desde, e.diaVenc);
  // Alta inicial a un grupo: el primer día de vencimiento cuya corrida colectiva no pasó.
  let objetivo = proximoDia(e.desde, e.diaVenc);
  while (
    e.diaCorteColectiva !== undefined &&
    !esPosterior(conDia(objetivo, e.diaCorteColectiva), e.fechaEmision)
  ) {
    objetivo = conDia(sumarMeses(objetivo, 1), e.diaVenc);
  }
  return objetivo;
}

export function calcularPeriodo(e: EntradaPeriodo): PeriodoCalculado {
  const objetivo = fechaObjetivo(e);
  if (objetivo === null) {
    return {
      fechaObjetivo: null,
      prorrataDias: 0,
      prorrataImporte: 0n as Centavos,
      incluyePeriodo: true,
      hasta: periodo(e.desde, e.meses).hasta,
    };
  }
  const prorrataDias = Math.max(diasEntre(e.desde, objetivo) + 1, 0);
  const incluyePeriodo = e.tipo === "RENOVACION";
  return {
    fechaObjetivo: objetivo,
    prorrataDias,
    prorrataImporte: prorrata(e.precioLista, prorrataDias, e.meses),
    incluyePeriodo,
    hasta: incluyePeriodo ? periodo(sumarDias(objetivo, 1), e.meses).hasta : objetivo,
  };
}

/**
 * Situación de un alta de paquetes temporales:
 * - TRIMESTRE_INICIAL: primer paquete temporal de un cliente no agrupado; se
 *   factura completo y nace sin día de vencimiento.
 * - ADICIONAL: el cliente ya tiene paquetes temporales; cobra el tramo hasta
 *   su vencimiento.
 * - GRUPO: cliente agrupado que paga por planilla; el alta espera la orden
 *   colectiva.
 */
export type SituacionAlta = "TRIMESTRE_INICIAL" | "ADICIONAL" | "GRUPO";

export function situacionAlta(e: {
  agrupado: boolean;
  planilla: boolean;
  tieneTemporales: boolean;
}): SituacionAlta {
  if (e.agrupado && e.planilla) return "GRUPO";
  // Los grupos no tienen trimestre inicial.
  return e.agrupado || e.tieneTemporales ? "ADICIONAL" : "TRIMESTRE_INICIAL";
}

/**
 * Plan permitido: el trimestral es solo para el alta inicial de un
 * cliente no agrupado, que no puede elegir otro; nunca para renovar.
 */
export function planPermitido(
  meses: number,
  tipoAccion: "ALTA" | "RENOVACION",
  situacion: SituacionAlta,
): boolean {
  const trimestral = meses === TRIMESTRAL_INICIAL;
  if (tipoAccion === "RENOVACION") return !trimestral;
  return situacion === "TRIMESTRE_INICIAL" ? trimestral : !trimestral;
}

export type Semaforo = "ROJO" | "AMARILLO" | "VERDE";

/**
 * Semáforo de una renovación a negociar: rojo si ya venció, amarillo
 * si vence dentro de `dias` días y verde el resto.
 */
export function semaforoNegociacion(hasta: Fecha, hoy: Fecha, dias: number): Semaforo {
  if (esPosterior(hoy, hasta)) return "ROJO";
  return diasEntre(hoy, hasta) <= dias ? "AMARILLO" : "VERDE";
}
