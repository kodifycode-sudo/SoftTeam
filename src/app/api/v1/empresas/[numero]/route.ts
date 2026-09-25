import { conApiFirmada, json, numeroEmpresa, problema } from "@/server/api/http";
import { empresaCompleta } from "@/server/modules/integraciones/datos";

/** GET /api/v1/empresas/{numero}: estructura completa de la empresa (EmpresaFull_V1). */
export async function GET(
  peticion: Request,
  { params }: RouteContext<"/api/v1/empresas/[numero]">,
) {
  return conApiFirmada(peticion, async ({ db }) => {
    const numero = numeroEmpresa((await params).numero);
    const empresa = numero === undefined ? undefined : await empresaCompleta(db, numero);
    return empresa ? json(empresa) : problema(404, "Empresa inexistente");
  });
}
