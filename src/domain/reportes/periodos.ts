import { dividirRedondeando, type Porcentaje } from "@/domain/dinero";
import { type Fecha, inicioDeMes, sumarDias, sumarMeses } from "@/domain/fecha";

/*
 * Comparaciones del tablero: el mes en curso contra el mismo tramo del mes
 * anterior (del 1 al mismo día), para no comparar medio mes contra un mes
 * entero.
 */

/** Rango de fechas con `hasta` exclusivo (el día siguiente al último incluido). */
export interface Rango {
  desde: Fecha;
  hasta: Fecha;
}

/**
 * Del día 1 a hoy, y del día 1 al mismo día del mes anterior. Si el mes
 * anterior es más corto (hoy 31 de marzo), el tramo anterior es el mes entero.
 */
export function periodosComparables(hoy: Fecha): { actual: Rango; anterior: Rango } {
  const inicio = inicioDeMes(hoy);
  const finAnterior = sumarDias(sumarMeses(hoy, -1), 1);
  return {
    actual: { desde: inicio, hasta: sumarDias(hoy, 1) },
    anterior: {
      desde: sumarMeses(inicio, -1),
      hasta: finAnterior < inicio ? finAnterior : inicio,
    },
  };
}

export interface Variacion {
  sentido: "sube" | "baja" | "igual";
  /** Cambio relativo en centésimos de punto (+12,5 % → 1250n); `null` si antes era cero. */
  porcentaje: Porcentaje | null;
  /** Diferencia absoluta (para conteos chicos, donde el porcentaje exagera). */
  diferencia: bigint;
}

export function variacion(actual: bigint, anterior: bigint): Variacion {
  const diferencia = actual - anterior;
  return {
    sentido: diferencia > 0n ? "sube" : diferencia < 0n ? "baja" : "igual",
    porcentaje: anterior > 0n ? dividirRedondeando(diferencia * 10_000n, anterior) : null,
    diferencia,
  };
}
