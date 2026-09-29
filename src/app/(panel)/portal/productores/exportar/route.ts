import { requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import {
  codigosParaExportar,
  columnasCodigos,
  columnasProductores,
  productoresParaExportar,
} from "@/server/modules/configuracion/exportacion";

/**
 * GET /portal/productores/exportar: productores de la empresa activa (del
 * alcance) en CSV; con ?contenido=codigos, sus códigos por compañía.
 */
export async function GET(peticion: Request) {
  const contexto = await requerirConfiguracion();
  const db = await obtenerDb();
  if (new URL(peticion.url).searchParams.get("contenido") === "codigos") {
    const codigos = await codigosParaExportar(db, contexto.empresaId, contexto.alcance);
    return respuestaCsv("codigos de productores", codigos, columnasCodigos(contexto.empresaNumero));
  }
  const productores = await productoresParaExportar(db, contexto.empresaId, contexto.alcance);
  return respuestaCsv("productores", productores, columnasProductores(contexto.empresaNumero));
}
