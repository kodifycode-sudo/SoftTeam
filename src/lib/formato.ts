import { type Centavos, centavos, formatearMoneda } from "@/domain/dinero";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const FORMATO_NUMERO = new Intl.NumberFormat("es-AR");

/** "2026-09-25" o Date → "25 sept 2026". */
export function fechaCorta(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = typeof valor === "string" ? new Date(`${valor.slice(0, 10)}T00:00:00Z`) : valor;
  return FORMATO_FECHA.format(d).replace(".", "");
}

export const numero = (valor: number) => FORMATO_NUMERO.format(valor);

/** Importe en centavos (o texto decimal de la base) → "$ 1.234,56". */
export function pesos(valor: Centavos | string | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return formatearMoneda(typeof valor === "string" ? centavos(valor) : valor);
}

/** Importe sin decimales cuando son cero: "$ 38.000". */
export function pesosRedondo(valor: Centavos): string {
  const texto = formatearMoneda(valor);
  return valor % 100n === 0n ? texto.replace(/,00$/, "") : texto;
}

/** 850n (centésimos de punto) → "8,5 %". */
export function porcentajeTexto(valor: bigint): string {
  const n = Number(valor) / 100;
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}
