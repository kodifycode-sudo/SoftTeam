import { claveMaestra } from "@/env";
import { esPedidoDelCron, json, problema } from "@/server/api/http";
import { obtenerDb } from "@/server/db";
import { entregarEventos } from "@/server/modules/integraciones/eventos";

/**
 * GET /api/cron/eventos: entrega los avisos pendientes a los webhooks.
 * La invoca el planificador (Vercel Cron) con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(peticion: Request) {
  if (!esPedidoDelCron(peticion)) return problema(401, "No autorizado");
  const db = await obtenerDb();
  const resumen = await entregarEventos(db, { claveMaestra, limite: 100 });
  return json(resumen);
}
