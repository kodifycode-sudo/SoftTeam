import { conApiFirmada, numeroEmpresa, problema } from "@/server/api/http";
import { logoDeEmpresaPorNumero } from "@/server/modules/configuracion/marca";

/**
 * GET /api/v1/empresas/{numero}/logo: logo de la marca blanca. Responde con
 * ETag (el hash del logo) para que los productos lo cacheen.
 */
export async function GET(
  peticion: Request,
  { params }: RouteContext<"/api/v1/empresas/[numero]/logo">,
) {
  return conApiFirmada(peticion, async ({ db }) => {
    const numero = numeroEmpresa((await params).numero);
    const logo = numero === undefined ? undefined : await logoDeEmpresaPorNumero(db, numero);
    if (!logo) return problema(404, "La empresa no tiene logo");
    const etag = `"${logo.hash}"`;
    if (peticion.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { etag } });
    }
    return new Response(new Uint8Array(logo.bytes), {
      headers: {
        "content-type": logo.tipo,
        etag,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
