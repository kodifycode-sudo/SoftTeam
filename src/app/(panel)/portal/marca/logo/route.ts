import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { logoDeEmpresa } from "@/server/modules/configuracion/marca";

/** GET /portal/marca/logo: logo de la empresa activa, para la vista previa del portal. */
export async function GET() {
  const contexto = await requerirCliente();
  const logo = await logoDeEmpresa(await obtenerDb(), contexto.empresaId);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.tipo,
      // La URL lleva el hash (?v=…): si cambia el logo, cambia la URL.
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
