import { APIError } from "better-auth/api";

interface ErrorDeAuth {
  statusCode: number;
  body?: { code?: string };
}

/**
 * Errores de Better Auth. Se reconocen por su forma además de por su clase:
 * con recarga en caliente el bundler puede tener dos copias de `APIError` y
 * `instanceof` fallar, lo que convertiría un login incorrecto en un error 500.
 */
export function esErrorDeAuth(e: unknown): e is ErrorDeAuth {
  return (
    e instanceof APIError ||
    (typeof e === "object" &&
      e !== null &&
      (e as { name?: unknown }).name === "APIError" &&
      typeof (e as { statusCode?: unknown }).statusCode === "number")
  );
}

export const codigoDeError = (e: unknown): string | undefined =>
  esErrorDeAuth(e) ? e.body?.code : undefined;

export const esLimiteDeIntentos = (e: unknown) => esErrorDeAuth(e) && e.statusCode === 429;
