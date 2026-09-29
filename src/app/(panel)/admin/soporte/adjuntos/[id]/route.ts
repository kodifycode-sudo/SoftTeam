import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaAdjunto } from "@/server/modules/soporte/descarga";
import { obtenerAdjunto } from "@/server/modules/soporte/incidentes";

/** GET /admin/soporte/adjuntos/{id}: cualquier adjunto, también los de notas internas. */
export async function GET(_: Request, { params }: RouteContext<"/admin/soporte/adjuntos/[id]">) {
  await requerirSofteam();
  const { id } = await params;
  const adjunto = await obtenerAdjunto(await obtenerDb(), id, {});
  return adjunto ? respuestaAdjunto(adjunto) : new Response("No encontrado", { status: 404 });
}
