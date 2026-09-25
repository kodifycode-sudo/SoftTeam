import { timingSafeEqual } from "node:crypto";
import { claveMaestra, secretoCron } from "@/env";
import { json, problema } from "@/server/api/http";
import { obtenerDb } from "@/server/db";
import { entregarEventos } from "@/server/modules/integraciones/eventos";

function autorizado(peticion: Request): boolean {
  const esperado = Buffer.from(`Bearer ${secretoCron}`);
  const recibido = Buffer.from(peticion.headers.get("authorization") ?? "");
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

/**
 * GET /api/cron/eventos: entrega los avisos pendientes a los webhooks.
 * La invoca el planificador (Vercel Cron) con `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(peticion: Request) {
  if (!autorizado(peticion)) return problema(401, "No autorizado");
  const db = await obtenerDb();
  const resumen = await entregarEventos(db, { claveMaestra, limite: 100 });
  return json(resumen);
}
