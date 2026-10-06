import { type AnyColumn, asc, desc, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import { desplazamiento, type Orden, type Pagina } from "@/lib/listados";

/**
 * Total de filas que cumplen el filtro, calculado antes del LIMIT: va como
 * columna de la misma consulta y evita un segundo `count(*)`.
 */
export const totalFiltrado = () => sql<number>`count(*) over()`.mapWith(Number);

/** ORDER BY de la columna elegida, con un desempate fijo para que las páginas no se pisen. */
export function ordenarPor<C extends string>(
  columnas: Record<C, AnyColumn | SQLWrapper>,
  orden: Orden<C>,
  desempate: AnyColumn,
): SQL[] {
  const direccion = orden.direccion === "asc" ? asc : desc;
  return [direccion(columnas[orden.columna]), direccion(desempate)];
}

/** Corta una página si se pidió; sin página devuelve todo (exportaciones). */
export function paginar<T extends PgSelect>(consulta: T, pagina: Pagina | undefined): T {
  return pagina ? consulta.limit(pagina.tamano).offset(desplazamiento(pagina)) : consulta;
}

/** Total del listado a partir de las filas de una página (0 si la página quedó vacía). */
export function totalDe(filas: readonly { totalFilas: number }[]): number {
  return filas[0]?.totalFilas ?? 0;
}
