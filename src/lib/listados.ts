/*
 * Paginación y orden de los listados del panel. Viven en la URL
 * (`?pagina=2&orden=nombre&dir=asc`), así un listado se puede recargar,
 * compartir o volver atrás sin perder dónde estaba.
 */

export const TAMANO_PAGINA = 25;

export type Direccion = "asc" | "desc";

export interface Pagina {
  numero: number;
  tamano: number;
}

export interface Orden<C extends string> {
  columna: C;
  direccion: Direccion;
}

/** Parámetros de búsqueda tal como los entrega Next (`searchParams`). */
export type ParametrosUrl = Record<string, string | string[] | undefined>;

function texto(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Lee la página de la URL (la 1 si falta o es inválida). */
export function leerPagina(parametros: ParametrosUrl, tamano = TAMANO_PAGINA): Pagina {
  const numero = Number(texto(parametros.pagina));
  return { numero: Number.isInteger(numero) && numero > 1 ? numero : 1, tamano };
}

/** Lee página y orden de la URL; lo inválido cae en los valores por defecto. */
export function leerListado<C extends string>(
  parametros: ParametrosUrl,
  columnas: readonly C[],
  porDefecto: Orden<C>,
  tamano = TAMANO_PAGINA,
): { pagina: Pagina; orden: Orden<C> } {
  const columna = texto(parametros.orden);
  const direccion = texto(parametros.dir);
  const columnaValida = columnas.find((c) => c === columna);
  return {
    pagina: leerPagina(parametros, tamano),
    orden: columnaValida
      ? {
          columna: columnaValida,
          direccion: direccion === "asc" || direccion === "desc" ? direccion : "asc",
        }
      : porDefecto,
  };
}

/** Desplazamiento de la consulta para una página. */
export function desplazamiento(pagina: Pagina): number {
  return (pagina.numero - 1) * pagina.tamano;
}

/**
 * Misma URL con algunos parámetros cambiados; `undefined` o "" los quita.
 * Cambiar cualquier cosa que no sea la página vuelve a la primera.
 */
export function hrefListado(
  base: string,
  parametros: ParametrosUrl,
  cambios: Record<string, string | number | undefined>,
): string {
  const url = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    const v = texto(valor);
    if (v) url.set(clave, v);
  }
  if (!("pagina" in cambios)) url.delete("pagina");
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined || valor === "" || (clave === "pagina" && valor === 1)) {
      url.delete(clave);
    } else {
      url.set(clave, String(valor));
    }
  }
  const consulta = url.toString();
  return consulta ? `${base}?${consulta}` : base;
}

/** Al hacer clic en una columna: si ya ordena por ella, invierte; si no, empieza ascendente. */
export function siguienteOrden<C extends string>(actual: Orden<C>, columna: C): Orden<C> {
  if (actual.columna !== columna) return { columna, direccion: "asc" };
  return { columna, direccion: actual.direccion === "asc" ? "desc" : "asc" };
}

/**
 * Números de página a mostrar: la primera, la última y las vecinas de la
 * actual; `null` marca un salto ("…").
 */
export function paginasVisibles(actual: number, total: number): (number | null)[] {
  const paginas = new Set([1, total, actual - 1, actual, actual + 1]);
  const ordenadas = [...paginas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const resultado: (number | null)[] = [];
  for (const [i, p] of ordenadas.entries()) {
    const anterior = ordenadas[i - 1];
    if (anterior !== undefined && p - anterior > 1) {
      resultado.push(p - anterior === 2 ? p - 1 : null);
    }
    resultado.push(p);
  }
  return resultado;
}
