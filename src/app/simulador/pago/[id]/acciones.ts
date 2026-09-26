"use server";

import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { secretoSimulador, simuladorDePagosActivo, urlBase } from "@/server/cobros";
import {
  avisoSimulado,
  CABECERA_FIRMA_SIMULADOR,
  crearPagoSimulado,
} from "@/server/cobros/simulador";
import { obtenerDb } from "@/server/db";
import * as t from "@/server/db/schema";

const esquema = z.object({
  ordenId: z.uuid(),
  resultado: z.enum(["APROBADO", "RECHAZADO", "IMPORTE_INCORRECTO"]),
});

/**
 * Simula lo que hace la pasarela real: registra el pago y avisa al webhook
 * de STLic con un aviso firmado. Después vuelve a la orden, como el
 * "volver al comercio" de Mercado Pago.
 */
export async function simularPagoAccion(formData: FormData): Promise<void> {
  if (!simuladorDePagosActivo()) notFound();
  const datos = esquema.safeParse(Object.fromEntries(formData));
  if (!datos.success) notFound();
  const db = await obtenerDb();
  const orden = await db.query.ordenes.findFirst({
    columns: { id: true, total: true, moneda: true },
    where: eq(t.ordenes.id, datos.data.ordenId),
  });
  if (!orden) notFound();

  const { resultado } = datos.data;
  const pagoId = crearPagoSimulado(secretoSimulador, {
    ordenId: orden.id,
    estado: resultado === "RECHAZADO" ? "RECHAZADO" : "APROBADO",
    monto: resultado === "IMPORTE_INCORRECTO" ? orden.total - 100n : orden.total,
    moneda: orden.moneda,
    ...(resultado === "RECHAZADO" ? { detalle: "Fondos insuficientes (simulado)" } : {}),
  });
  const aviso = avisoSimulado(secretoSimulador, pagoId);
  const respuesta = await fetch(`${urlBase}/api/pagos/aviso`, {
    method: "POST",
    headers: { "content-type": "application/json", [CABECERA_FIRMA_SIMULADOR]: aviso.firma },
    body: aviso.cuerpo,
  });
  if (!respuesta.ok) throw new Error(`El webhook respondió ${respuesta.status}`);
  redirect(
    `/portal/ordenes/${orden.id}?pago=${resultado === "RECHAZADO" ? "rechazado" : "informado"}`,
  );
}
