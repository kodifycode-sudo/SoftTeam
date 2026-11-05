"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  actualizarMedioPago,
  crearMedioPago,
  esquemaAltaMedioPago,
  esquemaMedioPago,
} from "@/server/modules/catalogo/medios-pago";

/** Campos comunes al alta y a la edición, como los espera el esquema. */
function datosDelFormulario(valores: Record<string, string>) {
  return {
    nombre: valores.nombre,
    ajustePorcentaje: valores.ajustePorcentaje || "0",
    habilitadoAlta: valores.habilitadoAlta === "on",
    habilitadoAdicional: valores.habilitadoAdicional === "on",
    habilitadoRenovacion: valores.habilitadoRenovacion === "on",
    modosFacturacion: [0, 1, 2, 3].filter((m) => valores[`modo${m}`] === "on"),
    activo: valores.activo === "on",
    instrucciones: valores.instrucciones || undefined,
  };
}

export async function crearMedioPagoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaAltaMedioPago.safeParse({
    ...datosDelFormulario(valores),
    codigo: valores.codigo,
    tipo: valores.tipo,
    paisId: valores.paisId || undefined,
  });
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores,
    };
  }

  const resultado = await crearMedioPago(await obtenerDb(), datos.data, user.id);
  if (!resultado.ok) {
    return resultado.error === "CODIGO_EXISTENTE"
      ? { errores: { codigo: ["Ya hay un medio de pago con ese código."] }, valores }
      : { errores: { paisId: ["El país no existe."] }, valores };
  }
  revalidatePath("/admin/medios-pago");
  return { ok: true, mensaje: `${datos.data.nombre} agregado.` };
}

export async function guardarMedioPagoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const id = z.uuid().safeParse(valores.id);
  const datos = esquemaMedioPago.safeParse(datosDelFormulario(valores));
  if (!id.success) return { mensaje: "Medio de pago inválido." };
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };

  const db = await obtenerDb();
  const ok = await actualizarMedioPago(db, id.data, datos.data, user.id);
  if (!ok) return { mensaje: "El medio de pago ya no existe." };
  revalidatePath("/admin/medios-pago");
  return { ok: true, mensaje: "Cambios guardados." };
}
