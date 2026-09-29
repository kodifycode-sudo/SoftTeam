/*
 * Adjuntos de los pedidos de soporte (capturas de pantalla, PDF). Se
 * validan por su contenido, no por la extensión ni por lo que declara el
 * navegador.
 */
import { type TipoImagen, tipoDeImagen } from "@/domain/cuentas/marca";

export const TAMANO_MAXIMO_ADJUNTO = 2 * 1024 * 1024;
export const ADJUNTOS_POR_MENSAJE = 3;
/** Entre todos los de un mensaje: el pedido entero tiene que entrar en el límite de 4 MB de las acciones. */
export const TAMANO_MAXIMO_TOTAL = 3.5 * 1024 * 1024;

export type TipoAdjunto = TipoImagen | "application/pdf";

export const EXTENSION_ADJUNTO: Record<TipoAdjunto, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function tipoDeAdjunto(bytes: Uint8Array): TipoAdjunto | undefined {
  const imagen = tipoDeImagen(bytes);
  if (imagen) return imagen;
  // "%PDF-"
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return pdf.every((b, i) => bytes[i] === b) ? "application/pdf" : undefined;
}

/**
 * Nombre para mostrar y descargar: sin rutas ni caracteres de control, y con
 * la extensión del tipo real.
 */
const PROHIBIDOS = '"<>|:*?';

export function nombreDeAdjunto(nombre: string, tipo: TipoAdjunto): string {
  const ultimo = nombre.split(/[\\/]/).pop() ?? "";
  const limpio = [...ultimo]
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && !PROHIBIDOS.includes(c))
    .join("");
  const base =
    limpio
      .replace(/\.[^.]*$/, "")
      .trim()
      .slice(0, 100) || "adjunto";
  return `${base}.${EXTENSION_ADJUNTO[tipo]}`;
}

export type ErrorAdjunto = "DEMASIADOS" | "DEMASIADO_GRANDE" | "FORMATO_INVALIDO";

export interface ArchivoAdjunto {
  nombre: string;
  bytes: Uint8Array;
}

export type AdjuntoValidado = { nombre: string; tipo: TipoAdjunto; bytes: Uint8Array };

/**
 * Valida los adjuntos de un mensaje: todos o ninguno. Los archivos vacíos se
 * descartan: es lo que manda el formulario cuando no se elige ninguno.
 */
export function validarAdjuntos(
  archivos: ArchivoAdjunto[],
): { ok: true; adjuntos: AdjuntoValidado[] } | { ok: false; error: ErrorAdjunto; nombre?: string } {
  const conContenido = archivos.filter((a) => a.bytes.length > 0);
  if (conContenido.length > ADJUNTOS_POR_MENSAJE) return { ok: false, error: "DEMASIADOS" };
  const total = conContenido.reduce((s, a) => s + a.bytes.length, 0);
  if (total > TAMANO_MAXIMO_TOTAL) return { ok: false, error: "DEMASIADO_GRANDE" };
  const adjuntos: AdjuntoValidado[] = [];
  for (const a of conContenido) {
    if (a.bytes.length > TAMANO_MAXIMO_ADJUNTO) {
      return { ok: false, error: "DEMASIADO_GRANDE", nombre: a.nombre };
    }
    const tipo = tipoDeAdjunto(a.bytes);
    if (!tipo) return { ok: false, error: "FORMATO_INVALIDO", nombre: a.nombre };
    adjuntos.push({ nombre: nombreDeAdjunto(a.nombre, tipo), tipo, bytes: a.bytes });
  }
  return { ok: true, adjuntos };
}
