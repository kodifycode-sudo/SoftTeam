import { requerirSofteam } from "@/server/auth/sesion";
import { DEFINICIONES, type TipoImportacion } from "@/server/modules/importacion/definiciones";

/**
 * GET /admin/importar/plantilla?tipo=clientes: archivo vacío con los títulos
 * de las columnas, separado por ";" (se abre en Excel en español).
 */
export async function GET(peticion: Request) {
  await requerirSofteam(["ADMINISTRACION"]);
  const tipo = new URL(peticion.url).searchParams.get("tipo");
  if (!tipo || !(tipo in DEFINICIONES)) return new Response("Tipo inválido", { status: 400 });
  const definicion = DEFINICIONES[tipo as TipoImportacion];
  const cabecera = definicion.columnas.map((c) => c.titulo).join(";");
  // Marca BOM: Excel reconoce los acentos.
  return new Response(`${String.fromCharCode(0xfeff)}${cabecera}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="plantilla-${tipo}.csv"`,
      "cache-control": "no-store",
    },
  });
}
