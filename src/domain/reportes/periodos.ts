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

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Meses "AAAA-MM" pedidos en un filtro de reportes. Sin datos válidos, los
 * últimos `porDefecto` meses hasta el actual; invertidos, se ordenan; nunca
 * más de `maximo` (se acorta desde el principio).
 */
export function rangoDeMeses(
  desdeTexto: string | undefined,
  hastaTexto: string | undefined,
  hoy: Fecha,
  porDefecto = 12,
  maximo = 36,
): { meses: string[]; rango: Rango } {
  const actual = hoy.slice(0, 7);
  let hasta = hastaTexto && MES.test(hastaTexto) ? hastaTexto : actual;
  let desde =
    desdeTexto && MES.test(desdeTexto)
      ? desdeTexto
      : sumarMeses(`${hasta}-01` as Fecha, -(porDefecto - 1)).slice(0, 7);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const meses: string[] = [];
  for (let m = `${desde}-01` as Fecha; m.slice(0, 7) <= hasta; m = sumarMeses(m, 1)) {
    meses.push(m.slice(0, 7));
  }
  const elegidos = meses.slice(-maximo);
  return {
    meses: elegidos,
    rango: {
      desde: `${elegidos[0]}-01` as Fecha,
      hasta: sumarMeses(`${elegidos.at(-1)}-01` as Fecha, 1),
    },
  };
}

/**
 * Días pedidos en un filtro ("AAAA-MM-DD", ambos incluidos). Por defecto, el
 * mes en curso hasta hoy; invertidos, se ordenan. `rango.hasta` es exclusivo.
 */
export function rangoDeDias(
  desdeTexto: string | undefined,
  hastaTexto: string | undefined,
  hoy: Fecha,
): { desde: Fecha; hasta: Fecha; rango: Rango } {
  let desde = desdeTexto && DIA.test(desdeTexto) ? (desdeTexto as Fecha) : inicioDeMes(hoy);
  let hasta = hastaTexto && DIA.test(hastaTexto) ? (hastaTexto as Fecha) : hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  return { desde, hasta, rango: { desde, hasta: sumarDias(hasta, 1) } };
}
