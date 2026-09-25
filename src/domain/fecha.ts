/**
 * Fechas de calendario sin hora ni zona ("2026-09-25"). Las vigencias son días
 * completos, así que no se modelan con `Date`, que arrastra hora y zona horaria.
 */

export type Fecha = string & { readonly __marca: "Fecha" };

const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONA_NEGOCIO = "America/Argentina/Buenos_Aires";

function partes(f: Fecha): [number, number, number] {
  const [anio, mes, dia] = f.split("-").map(Number);
  return [anio as number, mes as number, dia as number];
}

function desdeUTC(d: Date): Fecha {
  return d.toISOString().slice(0, 10) as Fecha;
}

/** Valida y crea una `Fecha`. Rechaza fechas inexistentes como "2026-02-30". */
export function fecha(texto: string): Fecha {
  const coincidencia = PATRON_FECHA.exec(texto);
  if (!coincidencia) throw new RangeError(`Fecha inválida: "${texto}"`);
  const [anio, mes, dia] = [
    Number(coincidencia[1]),
    Number(coincidencia[2]),
    Number(coincidencia[3]),
  ];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new RangeError(`Fecha inexistente: "${texto}"`);
  }
  return texto as Fecha;
}

/** Fecha de hoy en la zona horaria del negocio (Argentina). */
export function hoy(ahora: Date = new Date()): Fecha {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora) as Fecha;
}

export function sumarDias(f: Fecha, dias: number): Fecha {
  const [anio, mes, dia] = partes(f);
  return desdeUTC(new Date(Date.UTC(anio, mes - 1, dia + dias)));
}

/**
 * Suma meses con tope en el último día del mes: 31/01 + 1 mes = 28/02
 * (o 29 en año bisiesto), nunca 03/03.
 */
export function sumarMeses(f: Fecha, meses: number): Fecha {
  const [anio, mes, dia] = partes(f);
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0),
  ).getUTCDate();
  destino.setUTCDate(Math.min(dia, ultimoDia));
  return desdeUTC(destino);
}

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: Fecha, hasta: Fecha): number {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Comparación directa: el formato ISO ordena igual como texto que como fecha. */
export const esAnterior = (a: Fecha, b: Fecha): boolean => a < b;
export const esPosterior = (a: Fecha, b: Fecha): boolean => a > b;

/** Primer día del mes de la fecha. */
export function inicioDeMes(f: Fecha): Fecha {
  return `${f.slice(0, 7)}-01` as Fecha;
}
