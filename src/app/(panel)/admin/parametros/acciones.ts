"use server";

import { revalidatePath } from "next/cache";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  type ErrorMedioEnvio,
  esquemaMedioEnvio,
  guardarMedioEnvio,
} from "@/server/modules/consumos/medios-envio";
import { type ClaveParametro, guardarParametro, PARAMETROS } from "@/server/modules/parametros";

/** Guarda un parámetro del sistema (solo Administración). */
export async function guardarParametroAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const clave = String(formData.get("clave") ?? "");
  if (!(clave in PARAMETROS)) return { mensaje: "Parámetro inválido." };
  const valor = String(formData.get("valor") ?? "");
  const resultado = await guardarParametro(
    await obtenerDb(),
    clave as ClaveParametro,
    valor,
    user.id,
  );
  if (!resultado.ok) return { errores: { valor: [resultado.error] }, valores: { valor } };
  revalidatePath("/admin/parametros");
  return { ok: true, mensaje: `Guardamos "${PARAMETROS[clave as ClaveParametro].etiqueta}".` };
}

const MENSAJES_MEDIO: Record<ErrorMedioEnvio, string> = {
  NO_EXISTE: "El medio de envío no existe.",
  POR_DEFECTO: "El mail es el medio por defecto: no se puede desactivar.",
};

/** Cambia el factor o el estado de un medio de envío (solo Administración). */
export async function guardarMedioEnvioAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const factor = String(formData.get("factor") ?? "");
  const datos = esquemaMedioEnvio.safeParse({
    id: formData.get("id"),
    factor,
    activo: formData.get("activo") === "on",
  });
  if (!datos.success) {
    return {
      errores: { factor: [datos.error.issues[0]?.message ?? "Valor inválido."] },
      valores: { factor },
    };
  }
  const resultado = await guardarMedioEnvio(await obtenerDb(), datos.data, user.id);
  if (!resultado.ok) return { mensaje: MENSAJES_MEDIO[resultado.error], valores: { factor } };
  revalidatePath("/admin/parametros");
  return { ok: true, mensaje: "Guardamos el medio de envío." };
}
