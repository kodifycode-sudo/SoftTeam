import type { z } from "zod";

/** Estado que devuelven las Server Actions de formularios (para `useActionState`). */
export interface EstadoFormulario {
  ok?: boolean;
  mensaje?: string;
  errores?: Partial<Record<string, string[]>>;
  /** Valores enviados, para no perder lo tipeado cuando hay errores. */
  valores?: Record<string, string>;
}

export const ESTADO_INICIAL: EstadoFormulario = {};

/** Errores de Zod agrupados por campo (primer nivel del path). */
export function erroresPorCampo(error: z.ZodError): Record<string, string[]> {
  const errores: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "_");
    errores[campo] = [...(errores[campo] ?? []), issue.message];
  }
  return errores;
}

/** Errores de Zod por ruta completa ("domicilioFiscal.calle"), para formularios anidados. */
export function erroresPorRuta(error: z.ZodError): Record<string, string[]> {
  const errores: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const campo = issue.path.map(String).join(".") || "_";
    errores[campo] = [...(errores[campo] ?? []), issue.message];
  }
  return errores;
}

/**
 * Valores planos con claves "a.b" a un objeto anidado ({ a: { b } }). Los
 * vacíos se omiten: así los campos opcionales quedan `undefined`.
 */
export function anidar(valores: Record<string, string>): Record<string, unknown> {
  const raiz: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    const partes = clave.split(".");
    // Claves que podrían tocar el prototipo de Object: se descartan enteras.
    if (valor === "" || partes.some((p) => CLAVES_PROHIBIDAS.has(p))) continue;
    let nodo = raiz;
    for (const parte of partes.slice(0, -1)) {
      if (typeof nodo[parte] !== "object" || nodo[parte] === null) nodo[parte] = {};
      nodo = nodo[parte] as Record<string, unknown>;
    }
    nodo[partes.at(-1) as string] = valor;
  }
  return raiz;
}

const CLAVES_PROHIBIDAS = new Set(["__proto__", "constructor", "prototype"]);

/** FormData a objeto plano de strings (los checkbox marcados llegan como "on"). */
export function valoresDe(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const [clave, valor] of formData.entries()) {
    if (typeof valor === "string" && !clave.startsWith("$ACTION")) valores[clave] = valor;
  }
  return valores;
}

/**
 * Ruta interna segura para redirigir después del login (evita redirecciones
 * abiertas). Rechaza `//host` y también `/\host`: los navegadores tratan la
 * barra invertida como una barra y lo convierten en otro sitio. Tampoco
 * acepta caracteres de control (un salto de línea podría partir la cabecera).
 */
export function rutaInternaSegura(ruta: unknown, porDefecto: string): string {
  if (typeof ruta !== "string" || !ruta.startsWith("/") || ruta.startsWith("//")) {
    return porDefecto;
  }
  const insegura = [...ruta].some((c) => {
    const codigo = c.charCodeAt(0);
    return c === "\\" || codigo < 32 || codigo === 127;
  });
  return insegura ? porDefecto : ruta;
}
