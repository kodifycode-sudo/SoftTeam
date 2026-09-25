import { documentoOpenApi } from "@/server/api/openapi";

/** GET /api/v1/openapi.json: contrato de la API (público: no contiene datos). */
export function GET() {
  return Response.json(documentoOpenApi, { headers: { "cache-control": "public, max-age=3600" } });
}
