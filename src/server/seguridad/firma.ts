import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de peticiones entre sistemas (API de productos y webhooks).
 *
 * Texto firmado, una parte por línea:
 *   MÉTODO
 *   ruta con query ("/api/v1/empresas/2001/licencia")
 *   timestamp en segundos Unix
 *   SHA-256 hex del cuerpo (del cuerpo vacío si no hay)
 *
 * Firma: "v1=" + HMAC-SHA256(secreto, texto) en hex. El timestamp limita la
 * reutilización de una petición capturada (ventana de 5 minutos).
 */

export const CABECERA_SISTEMA = "x-stlic-sistema";
export const CABECERA_TIMESTAMP = "x-stlic-timestamp";
export const CABECERA_FIRMA = "x-stlic-firma";
export const VENTANA_SEGUNDOS = 300;

export interface PartesFirmadas {
  metodo: string;
  ruta: string;
  timestamp: number;
  cuerpo: string;
}

export const hashCuerpo = (cuerpo: string) =>
  createHash("sha256").update(cuerpo, "utf8").digest("hex");

export function textoAFirmar(p: PartesFirmadas): string {
  return [p.metodo.toUpperCase(), p.ruta, String(p.timestamp), hashCuerpo(p.cuerpo)].join("\n");
}

export function firmar(secreto: string, partes: PartesFirmadas): string {
  return `v1=${createHmac("sha256", secreto).update(textoAFirmar(partes), "utf8").digest("hex")}`;
}

export type ErrorFirma =
  | "FIRMA_FALTANTE"
  | "TIMESTAMP_INVALIDO"
  | "FUERA_DE_VENTANA"
  | "FIRMA_INVALIDA";

/** Verifica firma y ventana de tiempo. La comparación es de tiempo constante. */
export function verificarFirma(
  secreto: string,
  partes: Omit<PartesFirmadas, "timestamp"> & { timestamp: string | null },
  firmaRecibida: string | null,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; error: ErrorFirma } {
  if (!firmaRecibida || partes.timestamp === null) return { ok: false, error: "FIRMA_FALTANTE" };
  if (!/^\d{9,11}$/.test(partes.timestamp)) return { ok: false, error: "TIMESTAMP_INVALIDO" };
  const timestamp = Number(partes.timestamp);
  if (Math.abs(ahoraSegundos - timestamp) > VENTANA_SEGUNDOS)
    return { ok: false, error: "FUERA_DE_VENTANA" };

  const esperada = Buffer.from(firmar(secreto, { ...partes, timestamp }), "utf8");
  const recibida = Buffer.from(firmaRecibida, "utf8");
  const iguales = esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
  return iguales ? { ok: true } : { ok: false, error: "FIRMA_INVALIDA" };
}

/** Cabeceras firmadas para una petición saliente (webhooks) o para clientes de la API. */
export function cabecerasFirmadas(
  sistema: string,
  secreto: string,
  partes: Omit<PartesFirmadas, "timestamp">,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): Record<string, string> {
  return {
    [CABECERA_SISTEMA]: sistema,
    [CABECERA_TIMESTAMP]: String(ahoraSegundos),
    [CABECERA_FIRMA]: firmar(secreto, { ...partes, timestamp: ahoraSegundos }),
  };
}
