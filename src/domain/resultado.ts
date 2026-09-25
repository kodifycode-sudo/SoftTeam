/** Resultado explícito para reglas de negocio: los rechazos esperables no son excepciones. */
export type Resultado<T, E extends string> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly error: E; readonly detalle?: string };

export const exito = <T>(valor: T): Resultado<T, never> => ({ ok: true, valor });

export const rechazo = <E extends string>(error: E, detalle?: string): Resultado<never, E> =>
  detalle === undefined ? { ok: false, error } : { ok: false, error, detalle };
