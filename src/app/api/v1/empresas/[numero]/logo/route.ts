import { eq } from "drizzle-orm";
import { conApiFirmada, numeroEmpresa, problema } from "@/server/api/http";
import * as t from "@/server/db/schema";
import { logoDeEmpresa } from "@/server/modules/configuracion/marca";

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
    const empresa =
      numero === undefined
        ? undefined
        : await db.query.empresas.findFirst({
            columns: { id: true },
            where: eq(t.empresas.numero, numero),
          });
    const logo = empresa ? await logoDeEmpresa(db, empresa.id) : undefined;
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
