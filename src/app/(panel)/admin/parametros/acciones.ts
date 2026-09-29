"use server";

import { revalidatePath } from "next/cache";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
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
