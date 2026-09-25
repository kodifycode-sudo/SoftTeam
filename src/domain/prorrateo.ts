import type { Centavos } from "./dinero";

/**
 * Reparte `total` entre partes proporcionales a `pesos` por el método de los
 * restos mayores: cada parte recibe su cuota entera y los centavos sobrantes
 * van, de a uno, a las partes con mayor resto (empate: la de menor índice).
 *
 * La suma del resultado es exactamente `total`, y el redondeo nunca se
 * concentra en un solo ítem (el diseño original cargaba toda la diferencia en
 * el último).
 */
export function prorratear(total: Centavos, pesos: readonly Centavos[]): Centavos[] {
  if (total < 0n) throw new RangeError("El total a prorratear no puede ser negativo");
  if (pesos.some((p) => p < 0n)) throw new RangeError("Los pesos no pueden ser negativos");
  if (pesos.length === 0) {
    if (total !== 0n) throw new RangeError("No hay partes entre las que repartir");
    return [];
  }

  const sumaPesos = pesos.reduce((a, b) => a + b, 0n);
  // Sin pesos (todo bonificado al 100 %), se reparte en partes iguales.
  const efectivos = sumaPesos === 0n ? pesos.map(() => 1n) : pesos;
  const divisor = sumaPesos === 0n ? BigInt(pesos.length) : sumaPesos;

  const cuotas = efectivos.map((peso) => (total * peso) / divisor);
  const restos = efectivos.map((peso, indice) => ({
    indice,
    resto: (total * peso) % divisor,
  }));

  let sobrante = total - cuotas.reduce((a, b) => a + b, 0n);
  restos.sort((a, b) => (a.resto === b.resto ? a.indice - b.indice : a.resto > b.resto ? -1 : 1));
  for (const { indice } of restos) {
    if (sobrante === 0n) break;
    cuotas[indice] = (cuotas[indice] as bigint) + 1n;
    sobrante -= 1n;
  }
  return cuotas;
}
