import { conApiFirmada, json, problema } from "@/server/api/http";
import { listarEmpresasParaSincronizar } from "@/server/modules/integraciones/datos";

/**
 * GET /api/v1/empresas?modificadasDesde=<ISO 8601>&soloActivas=1
 * Empresas para sincronizar. Con `modificadasDesde`, solo las que cambiaron
 * desde ese instante (incluidas las desactivadas).
 */
export async function GET(peticion: Request) {
  return conApiFirmada(peticion, async ({ db }) => {
    const parametros = new URL(peticion.url).searchParams;
    const desde = parametros.get("modificadasDesde");
    const modificadasDesde = desde ? new Date(desde) : undefined;
    if (modificadasDesde && Number.isNaN(modificadasDesde.getTime())) {
      return problema(400, "Parámetro inválido", "modificadasDesde debe ser una fecha ISO 8601.");
    }
    const empresas = await listarEmpresasParaSincronizar(db, {
      modificadasDesde,
      soloActivas: parametros.get("soloActivas") === "1",
    });
    return json({ empresas });
  });
}
