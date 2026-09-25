/**
 * Dinero exacto. Los importes viajan como centavos enteros (`bigint`) y los
 * porcentajes como centésimos de punto (21,00 % = 2100n). Ningún cálculo de
 * dinero pasa por `number`: el punto flotante no puede representar 0,1.
 */

/** Importe en centavos. */
export type Centavos = bigint;

/** Porcentaje con dos decimales, en centésimos de punto: 21,00 % → 2100n. */
export type Porcentaje = bigint;

const CIEN_POR_CIENTO: Porcentaje = 10_000n;

/**
 * División entera con redondeo a la mitad alejándose de cero, el mismo
 * criterio que `ROUND()` de SQL: 2,5 → 3 y −2,5 → −3.
 */
export function dividirRedondeando(numerador: bigint, divisor: bigint): bigint {
  if (divisor === 0n) throw new RangeError("División por cero");
  const negativo = numerador < 0n !== divisor < 0n;
  const n = numerador < 0n ? -numerador : numerador;
  const d = divisor < 0n ? -divisor : divisor;
  const cociente = n / d;
  const redondeado = (n % d) * 2n >= d ? cociente + 1n : cociente;
  return negativo ? -redondeado : redondeado;
}

/** `importe × porcentaje / 100`, redondeado a centavos. */
export function aplicarPorcentaje(importe: Centavos, porcentaje: Porcentaje): Centavos {
  return dividirRedondeando(importe * porcentaje, CIEN_POR_CIENTO);
}

export function sumar(importes: Iterable<Centavos>): Centavos {
  let total = 0n;
  for (const importe of importes) total += importe;
  return total;
}

export function minimo(a: Centavos, b: Centavos): Centavos {
  return a < b ? a : b;
}

export function maximo(a: Centavos, b: Centavos): Centavos {
  return a > b ? a : b;
}

const PATRON_DECIMAL = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/;

/** Convierte un decimal de hasta 2 posiciones ("1234.5", "1234,56") en unidades ×100. */
function desdeTextoConDosDecimales(texto: string, que: string): bigint {
  const coincidencia = PATRON_DECIMAL.exec(texto.trim());
  if (!coincidencia) throw new RangeError(`${que} inválido: "${texto}"`);
  const [, signo, enteros = "0", decimales = ""] = coincidencia;
  const valor = BigInt(enteros) * 100n + BigInt(decimales.padEnd(2, "0"));
  return signo ? -valor : valor;
}

/** "1234.56" o "1234,56" → 123456n. Exacto: no pasa por `number`. */
export function centavos(texto: string): Centavos {
  return desdeTextoConDosDecimales(texto, "Importe");
}

/** "21" o "8,5" → 2100n / 850n. */
export function porcentaje(texto: string): Porcentaje {
  return desdeTextoConDosDecimales(texto, "Porcentaje");
}

/** 123456n → "1234.56": formato para columnas `numeric` de Postgres y para JSON. */
export function aTextoDecimal(valor: bigint): string {
  const negativo = valor < 0n;
  const absoluto = negativo ? -valor : valor;
  const enteros = absoluto / 100n;
  const decimales = (absoluto % 100n).toString().padStart(2, "0");
  return `${negativo ? "-" : ""}${enteros}.${decimales}`;
}

/** 123456n → "$ 1.234,56" (formato local, sin pasar por `number`). */
export function formatearMoneda(importe: Centavos, moneda = "ARS", locale = "es-AR"): string {
  // Intl acepta strings decimales exactos (Intl.NumberFormat v3).
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: moneda,
  }).format(aTextoDecimal(importe) as `${number}`);
}
