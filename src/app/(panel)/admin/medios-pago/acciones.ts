"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { actualizarMedioPago, esquemaMedioPago } from "@/server/modules/catalogo/medios-pago";

export async function guardarMedioPagoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const id = z.uuid().safeParse(valores.id);
  const datos = esquemaMedioPago.safeParse({
    nombre: valores.nombre,
    ajustePorcentaje: valores.ajustePorcentaje || "0",
    habilitadoAlta: valores.habilitadoAlta === "on",
    habilitadoAdicional: valores.habilitadoAdicional === "on",
    habilitadoRenovacion: valores.habilitadoRenovacion === "on",
    activo: valores.activo === "on",
    instrucciones: valores.instrucciones || undefined,
  });
  if (!id.success) return { mensaje: "Medio de pago inválido." };
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };

  const db = await obtenerDb();
  const ok = await actualizarMedioPago(db, id.data, datos.data, user.id);
  if (!ok) return { mensaje: "El medio de pago ya no existe." };
  revalidatePath("/admin/medios-pago");
  return { ok: true, mensaje: "Cambios guardados." };
}
