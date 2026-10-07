import { type Centavos, dividirRedondeando, type Porcentaje } from "@/domain/dinero";

/*
 * Ayuda a comparar las alternativas de un paquete: cuánto sale por mes una
 * alternativa de varios meses y cuánto se ahorra frente a pagar mes a mes.
 */

export interface AlternativaPrecio {
  id: string;
  /** `null` en los consumibles (pago único). */
  meses: number | null;
  precioCompra: Centavos;
}

export interface Comparacion {
  /** Precio mensual equivalente. */
  porMes: Centavos;
  /** Ahorro frente a la alternativa mensual, en puntos enteros (10 % → 1000n); `null` si no hay. */
  ahorro: Porcentaje | null;
}

/**
 * Para cada alternativa de más de un mes, su precio mensual equivalente y,
 * si el paquete también se vende por mes, cuánto ahorra. El ahorro se
 * redondea a puntos enteros: es un dato para decidir, no para facturar.
 */
export function compararConMensual(
  alternativas: readonly AlternativaPrecio[],
): Map<string, Comparacion> {
  const mensual = alternativas.find((a) => a.meses === 1);
  const resultado = new Map<string, Comparacion>();
  for (const a of alternativas) {
    if (a.meses === null || a.meses <= 1) continue;
    const meses = BigInt(a.meses);
    const porMes = dividirRedondeando(a.precioCompra, meses);
    let ahorro: Porcentaje | null = null;
    if (mensual && mensual.precioCompra > 0n) {
      const sinDescuento = mensual.precioCompra * meses;
      const puntos = dividirRedondeando((sinDescuento - a.precioCompra) * 100n, sinDescuento);
      if (puntos > 0n) ahorro = puntos * 100n;
    }
    resultado.set(a.id, { porMes, ahorro });
  }
  return resultado;
}
