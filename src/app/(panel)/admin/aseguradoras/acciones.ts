"use server";

import { revalidatePath } from "next/cache";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { esquemaAseguradora, guardarAseguradora } from "@/server/modules/catalogo/aseguradoras";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

export async function guardarAseguradoraAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const marcada = (campo: string) => valores[campo] === "on";
  const datos = esquemaAseguradora.safeParse({
    id: valores.id || undefined,
    nombre: valores.nombre,
    abreviatura: valores.abreviatura,
    codigoLegal: valores.codigoLegal || undefined,
    interfazProdigalDisponible: marcada("interfazProdigalDisponible"),
    interfazCotiwebDisponible: marcada("interfazCotiwebDisponible"),
    interfazDocumentosDisponible: marcada("interfazDocumentosDisponible"),
    // En el alta nace activa; en la edición manda la casilla.
    activa: valores.id ? marcada("activa") : true,
  });
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores,
    };
  }
  const resultado = await guardarAseguradora(await obtenerDb(), datos.data, user.id);
  if (!resultado.ok) {
    return resultado.error === "ABREVIATURA_EXISTENTE"
      ? { errores: { abreviatura: ["Ya hay una aseguradora con esa abreviatura."] }, valores }
      : { mensaje: "La aseguradora ya no existe.", valores };
  }
  programarEntregaDeEventos();
  revalidatePath("/admin/aseguradoras");
  return {
    ok: true,
    mensaje: datos.data.id
      ? "Aseguradora actualizada."
      : `${datos.data.nombre} agregada al catálogo.`,
  };
}
