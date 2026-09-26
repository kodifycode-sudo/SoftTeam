/*
 * Reglas de la marca blanca y de las notas de SOFTeam. Puras y probadas.
 */

export const TAMANO_MAXIMO_LOGO = 300 * 1024;

export type TipoImagen = "image/png" | "image/jpeg" | "image/webp";

/**
 * Tipo real de una imagen, por su contenido (no por la extensión ni por lo
 * que declara el navegador). SVG no se acepta: puede llevar scripts.
 */
export function tipoDeImagen(bytes: Uint8Array): TipoImagen | undefined {
  const empieza = (...firma: number[]) => firma.every((b, i) => bytes[i] === b);
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (empieza(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (
    empieza(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

export type ErrorLogo = "FORMATO_INVALIDO" | "DEMASIADO_GRANDE" | "VACIO";

export function validarLogo(
  bytes: Uint8Array,
): { ok: true; tipo: TipoImagen } | { ok: false; error: ErrorLogo } {
  if (bytes.length === 0) return { ok: false, error: "VACIO" };
  if (bytes.length > TAMANO_MAXIMO_LOGO) return { ok: false, error: "DEMASIADO_GRANDE" };
  const tipo = tipoDeImagen(bytes);
  return tipo ? { ok: true, tipo } : { ok: false, error: "FORMATO_INVALIDO" };
}

export const COLOR_HEX = /^#[0-9a-f]{6}$/i;

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Relación de contraste WCAG entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Texto blanco o negro, el que se lea mejor sobre el color. */
export function textoSobre(fondo: string): "#ffffff" | "#000000" {
  return contraste(fondo, "#ffffff") >= contraste(fondo, "#000000") ? "#ffffff" : "#000000";
}

/** WCAG AA para texto normal. */
export const CONTRASTE_MINIMO = 4.5;

/**
 * Notas de SOFTeam sobre una empresa: las líneas que empiezan con "*" son
 * internas y solo las ve SOFTeam.
 */
export function notasVisibles(notas: string | null | undefined, esSofteam: boolean): string {
  if (!notas) return "";
  if (esSofteam) return notas.trim();
  return notas
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("*"))
    .join("\n")
    .trim();
}
