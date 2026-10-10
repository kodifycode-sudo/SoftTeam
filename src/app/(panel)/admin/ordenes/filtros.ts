import { MODOS_FACTURACION } from "@/domain/facturacion/modo";
import type { hoy } from "@/domain/fecha";
import { rangoDeDias } from "@/domain/reportes/periodos";

type Parametros = Record<string, string | string[] | undefined> | URLSearchParams;

const leer = (p: Parametros, clave: string) => {
  const v = p instanceof URLSearchParams ? p.get(clave) : p[clave];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

/**
 * Filtros del listado de órdenes de SOFTeam, leídos de la URL: la pantalla y
 * la exportación usan los mismos.
 */
export function filtrosDeOrdenes(p: Parametros, fecha: ReturnType<typeof hoy>) {
  const desde = leer(p, "desde");
  const hasta = leer(p, "hasta");
  const modo = Number(leer(p, "modo"));
  const uuid = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  return {
    busqueda: leer(p, "q") ?? "",
    // Sin fechas, no se filtra por emisión.
    emitidas: desde || hasta ? rangoDeDias(desde, hasta, fecha) : undefined,
    emisorId: uuid(leer(p, "emisor")),
    medioPagoId: uuid(leer(p, "medio")),
    modoFacturacion: (MODOS_FACTURACION as readonly number[]).includes(modo) ? modo : undefined,
  };
}

export type FiltrosOrdenes = ReturnType<typeof filtrosDeOrdenes>;
