/*
 * CSV para abrir directo en Excel con configuración regional de Argentina:
 * separador ";" (la coma es el separador decimal), BOM UTF-8 para que
 * respete los acentos, y fin de línea CRLF.
 */

export type ValorCelda = string | number | bigint | boolean | Date | null | undefined;

export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => ValorCelda;
}

const BOM = "\uFEFF";
const SEPARADOR = ";";

/** Importe en centavos → "1234,56" (sin separador de miles: Excel lo lee como número). */
export function importeCsv(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const entero = abs / 100n;
  const decimales = String(abs % 100n).padStart(2, "0");
  return `${negativo ? "-" : ""}${entero},${decimales}`;
}

/**
 * Evita la inyección de fórmulas: un texto que empieza con =, +, - o @ se
 * interpretaría como fórmula al abrirlo en Excel.
 */
function neutralizar(texto: string): string {
  // Un número (también negativo) no es una fórmula: se deja como está.
  if (/^-?\d+(,\d+)?$/.test(texto)) return texto;
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

function celda(valor: ValorCelda): string {
  if (valor === null || valor === undefined) return "";
  let texto: string;
  if (typeof valor === "boolean") texto = valor ? "Sí" : "No";
  else if (valor instanceof Date) texto = valor.toISOString().replace("T", " ").slice(0, 19);
  else if (typeof valor === "number") texto = String(valor).replace(".", ",");
  else if (typeof valor === "bigint") texto = String(valor);
  else texto = neutralizar(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

export function aCsv<T>(filas: readonly T[], columnas: readonly Columna<T>[]): string {
  const lineas = [
    columnas.map((c) => celda(c.titulo)).join(SEPARADOR),
    ...filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(SEPARADOR)),
  ];
  return `${BOM}${lineas.join("\r\n")}\r\n`;
}

/** Nombre de archivo seguro con la fecha: "ordenes-2026-09-26.csv". */
export function nombreArchivo(base: string, fecha: string): string {
  const limpio = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${limpio}-${fecha}.csv`;
}
