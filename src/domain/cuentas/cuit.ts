const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
const PREFIJOS_VALIDOS = new Set(["20", "23", "24", "25", "26", "27", "30", "33", "34"]);

/** Deja solo los dígitos: acepta "20-12345678-6", "20 12345678 6" o "20123456786". */
export function normalizarCuit(texto: string): string {
  return texto.replace(/\D/g, "");
}

/**
 * Valida un CUIT/CUIL argentino: 11 dígitos, prefijo de tipo válido y dígito
 * verificador por módulo 11.
 */
export function esCuitValido(texto: string): boolean {
  const cuit = normalizarCuit(texto);
  if (!/^\d{11}$/.test(cuit) || !PREFIJOS_VALIDOS.has(cuit.slice(0, 2))) return false;
  const digitos = [...cuit].map(Number);
  const suma = PESOS.reduce((acumulado, peso, i) => acumulado + peso * (digitos[i] as number), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === digitos[10];
}

/** "20123456786" → "20-12345678-6". */
export function formatearCuit(texto: string): string {
  const cuit = normalizarCuit(texto);
  return cuit.length === 11 ? `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}` : texto;
}
