import { timingSafeEqual } from "node:crypto";
import { hoy } from "@/domain/fecha";
import { claveMaestra, secretoCron } from "@/env";
import { json, problema } from "@/server/api/http";
import { obtenerDb } from "@/server/db";
import { entregarEventos } from "@/server/modules/integraciones/eventos";
import { enviarAlertaPorMail } from "@/server/modules/procesos/mail";
import { correrProcesos } from "@/server/modules/procesos/procesos";

function autorizado(peticion: Request): boolean {
  const esperado = Buffer.from(`Bearer ${secretoCron}`);
  const recibido = Buffer.from(peticion.headers.get("authorization") ?? "");
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

/**
 * GET /api/cron/procesos: renovación, proceso diario, recordatorios y envío
 * de avisos. Idempotente: se puede invocar varias veces por día. La invoca el
 * planificador con `Authorization: Bearer <CRON_SECRET>` (una vez por día, 06:00).
 */
export async function GET(peticion: Request) {
  if (!autorizado(peticion)) return problema(401, "No autorizado");
  const db = await obtenerDb();
  const resumen = await correrProcesos(db, hoy(), enviarAlertaPorMail);
  // Los cambios de licencia del día (excepciones vencidas) se avisan a los productos.
  await entregarEventos(db, { claveMaestra, limite: 100 });
  return json(resumen);
}
