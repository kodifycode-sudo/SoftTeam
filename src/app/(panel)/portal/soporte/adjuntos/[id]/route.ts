import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaAdjunto } from "@/server/modules/soporte/descarga";
import { obtenerAdjunto } from "@/server/modules/soporte/incidentes";

/** GET /portal/soporte/adjuntos/{id}: adjunto de un pedido de la empresa (y del alcance). */
export async function GET(_: Request, { params }: RouteContext<"/portal/soporte/adjuntos/[id]">) {
  const contexto = await requerirCliente();
  const { id } = await params;
  const adjunto = await obtenerAdjunto(await obtenerDb(), id, {
    empresaId: contexto.empresaId,
    alcance: contexto.alcance,
  });
  return adjunto ? respuestaAdjunto(adjunto) : new Response("No encontrado", { status: 404 });
}
