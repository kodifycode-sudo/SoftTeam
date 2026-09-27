"use server";

import { revalidatePath } from "next/cache";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirConfiguracionEmpresa } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { esquemaPoliticas, guardarPoliticas } from "@/server/modules/configuracion/politicas";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

export async function guardarPoliticasAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracionEmpresa();
  const valores = valoresDe(formData);
  const sinTope = valores.sinTope === "on";
  const datos = esquemaPoliticas.safeParse({
    oficinasNotifican: valores.oficinasNotifican === "on",
    oficinasUsanPozoEmpresa: valores.oficinasUsanPozoEmpresa === "on",
    topeMensualPozoPorOficina: sinTope
      ? null
      : Number(valores.topeMensualPozoPorOficina || Number.NaN),
    oficinasContratan: valores.oficinasContratan === "on",
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  await guardarPoliticas(await obtenerDb(), contexto.empresaId, datos.data, contexto.usuarioId);
  programarEntregaDeEventos();
  revalidatePath("/portal/politicas");
  return { ok: true, mensaje: "Políticas guardadas." };
}
