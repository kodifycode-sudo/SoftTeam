"use server";

import { revalidatePath } from "next/cache";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { type CambioLogo, esquemaMarca, guardarMarca } from "@/server/modules/configuracion/marca";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

const ERRORES_LOGO = {
  FORMATO_INVALIDO: "El logo tiene que ser PNG, JPG o WebP.",
  DEMASIADO_GRANDE: "El logo pesa demasiado: hasta 300 KB.",
  VACIO: "El archivo del logo está vacío.",
} as const;

export async function guardarMarcaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracion();
  const valores = valoresDe(formData);
  const vacio = (campo: string) => valores[campo]?.trim() || undefined;
  const datos = esquemaMarca.safeParse({
    nombreComercial: vacio("nombreComercial"),
    eslogan: vacio("eslogan"),
    colorPrimario: vacio("colorPrimario"),
    colorSecundario: vacio("colorSecundario"),
    textoBienvenida: vacio("textoBienvenida"),
    firmaMail: vacio("firmaMail"),
    web: vacio("web"),
    email: vacio("email"),
    telefono: vacio("telefono"),
    whatsapp: vacio("whatsapp"),
  });
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores,
    };
  }

  const archivo = formData.get("logo");
  let logo: CambioLogo = { accion: "MANTENER" };
  if (valores.quitarLogo === "on") logo = { accion: "QUITAR" };
  else if (archivo instanceof File && archivo.size > 0) {
    logo = { accion: "REEMPLAZAR", bytes: new Uint8Array(await archivo.arrayBuffer()) };
  }

  const resultado = await guardarMarca(
    await obtenerDb(),
    contexto.empresaId,
    datos.data,
    logo,
    contexto.usuarioId,
  );
  if (!resultado.ok) return { errores: { logo: [ERRORES_LOGO[resultado.error]] }, valores };
  programarEntregaDeEventos();
  revalidatePath("/portal/marca");
  return {
    ok: true,
    mensaje: "Marca guardada. Los productos la toman en la próxima sincronización.",
  };
}
