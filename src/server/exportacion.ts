import "server-only";
import { aCsv, type Columna, nombreArchivo } from "@/domain/exportacion/csv";
import { hoy } from "@/domain/fecha";

/** Descarga de un CSV (Excel en español) con nombre de archivo fechado. */
export function respuestaCsv<T>(base: string, filas: readonly T[], columnas: Columna<T>[]) {
  return new Response(aCsv(filas, columnas), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nombreArchivo(base, hoy())}"`,
      "cache-control": "no-store",
    },
  });
}
