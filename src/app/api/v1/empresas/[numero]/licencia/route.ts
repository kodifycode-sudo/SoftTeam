import { conApiFirmada, json, numeroEmpresa, problema } from "@/server/api/http";
import { licenciaParaApi } from "@/server/modules/integraciones/datos";

/** GET /api/v1/empresas/{numero}/licencia: licencia vigente hoy (suma de contratos vigentes). */
export async function GET(
  peticion: Request,
  { params }: RouteContext<"/api/v1/empresas/[numero]/licencia">,
) {
  return conApiFirmada(peticion, async ({ db }) => {
    const numero = numeroEmpresa((await params).numero);
    const licencia = numero === undefined ? undefined : await licenciaParaApi(db, numero);
    return licencia ? json(licencia) : problema(404, "Empresa inexistente");
  });
}
