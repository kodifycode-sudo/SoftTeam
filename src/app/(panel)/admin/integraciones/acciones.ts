"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { claveMaestra } from "@/env";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { reintentarEvento } from "@/server/modules/integraciones/eventos";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";
import {
  actualizarSistema,
  crearSistema,
  esquemaSistema,
  rotarSecreto,
} from "@/server/modules/integraciones/sistemas";

/** Estado con el secreto recién generado: se muestra una sola vez y no se guarda en claro. */
export interface EstadoSecreto extends EstadoFormulario {
  secreto?: string;
  sistema?: string;
}

export async function crearSistemaAccion(
  _: EstadoSecreto,
  formData: FormData,
): Promise<EstadoSecreto> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaSistema.safeParse({
    ...valores,
    webhookUrl: valores.webhookUrl || undefined,
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const db = await obtenerDb();
  const resultado = await crearSistema(db, datos.data, claveMaestra, user.id);
  if (!resultado.ok)
    return { errores: { sistema: ["Ya existe un sistema con ese identificador"] }, valores };
  revalidatePath("/admin/integraciones");
  return { ok: true, secreto: resultado.secreto, sistema: datos.data.sistema };
}

export async function rotarSecretoAccion(
  _: EstadoSecreto,
  formData: FormData,
): Promise<EstadoSecreto> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { mensaje: "Sistema inválido." };
  const db = await obtenerDb();
  const secreto = await rotarSecreto(db, id.data, claveMaestra, user.id);
  if (!secreto) return { mensaje: "El sistema ya no existe." };
  revalidatePath("/admin/integraciones");
  return { ok: true, secreto, sistema: String(formData.get("sistema") ?? "") };
}

const esquemaWebhook = z.object({
  id: z.uuid(),
  webhookUrl: esquemaSistema.shape.webhookUrl,
});

export async function actualizarWebhookAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaWebhook.safeParse({
    id: valores.id,
    webhookUrl: valores.webhookUrl || undefined,
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const db = await obtenerDb();
  await actualizarSistema(
    db,
    datos.data.id,
    { webhookUrl: datos.data.webhookUrl ?? null },
    user.id,
  );
  revalidatePath("/admin/integraciones");
  return { ok: true, mensaje: "Webhook actualizado." };
}

export async function cambiarActivoSistemaAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const datos = z
    .object({ id: z.uuid(), activo: z.enum(["true", "false"]) })
    .parse({ id: formData.get("id"), activo: formData.get("activo") });
  const db = await obtenerDb();
  await actualizarSistema(db, datos.id, { activo: datos.activo === "true" }, user.id);
  revalidatePath("/admin/integraciones");
}

export async function reintentarEventoAccion(formData: FormData): Promise<void> {
  await requerirSofteam(["ADMINISTRACION"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const db = await obtenerDb();
  await reintentarEvento(db, id);
  programarEntregaDeEventos();
  revalidatePath("/admin/integraciones");
}

const esquemaLimite = z.object({
  id: z.uuid(),
  limitePorMinuto: z.coerce
    .number({ error: "Ingresá un número." })
    .int({ error: "Un número entero." })
    .min(10, { error: "Entre 10 y 100.000 pedidos por minuto." })
    .max(100_000, { error: "Entre 10 y 100.000 pedidos por minuto." }),
});

/** Cambia cuántos pedidos por minuto acepta la API de un sistema (solo Administración). */
export async function actualizarLimiteAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaLimite.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  await actualizarSistema(
    await obtenerDb(),
    datos.data.id,
    { limitePorMinuto: datos.data.limitePorMinuto },
    user.id,
  );
  revalidatePath("/admin/integraciones");
  return { ok: true, mensaje: "Límite actualizado." };
}
