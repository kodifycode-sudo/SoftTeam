import { and, eq, isNotNull } from "drizzle-orm";
import type { Centavos } from "@/domain/dinero";
import { formatearMoneda } from "@/domain/dinero";
import type { Fecha } from "@/domain/fecha";
import { fechaCorta } from "@/lib/formato";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { registrarAlerta } from "./alertas";

/**
 * Recordatorio de cada orden impaga (de una empresa) en los días de
 * recordatorio. Uno por orden y por día: reejecutar no duplica.
 */
export async function procesoRecordatorios(db: Db, hoy: Fecha): Promise<{ recordatorios: number }> {
  const ordenes = await db
    .select({
      id: t.ordenes.id,
      numero: t.ordenes.numero,
      empresaId: t.ordenes.empresaId,
      total: t.ordenes.total,
      emitidaEn: t.ordenes.emitidaEn,
    })
    .from(t.ordenes)
    .where(and(eq(t.ordenes.estado, "PEND_PAGO"), isNotNull(t.ordenes.empresaId)));

  let recordatorios = 0;
  for (const o of ordenes) {
    const creada = await registrarAlerta(db, {
      tipo: "RECORDATORIO_PAGO",
      clave: `RECORDATORIO_PAGO:${o.id}:${hoy}`,
      mensaje: `La orden #${o.numero} por ${formatearMoneda(o.total as Centavos)} está pendiente de pago desde el ${fechaCorta(o.emitidaEn)}.`,
      empresaId: o.empresaId,
      ordenId: o.id,
      paraSofteam: false,
    });
    if (creada) recordatorios++;
  }
  return { recordatorios };
}
