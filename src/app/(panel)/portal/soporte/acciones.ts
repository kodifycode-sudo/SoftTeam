"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  abrirIncidente,
  cambiarEstadoIncidente,
  esquemaIncidente,
  responderIncidente,
} from "@/server/modules/soporte/incidentes";

export async function abrirIncidenteAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirCliente();
  const valores = valoresDe(formData);
  const datos = esquemaIncidente.safeParse(valores);
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores,
    };
  }
  const resultado = await abrirIncidente(
    await obtenerDb(),
    {
      empresaId: contexto.empresaId,
      empresaNumero: contexto.empresaNumero,
      usuarioId: contexto.usuarioId,
    },
    datos.data,
  );
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error === "SIN_CREDITOS"
          ? "No te quedan tickets de soporte este mes. Sumá un paquete de soporte para seguir consultando."
          : "La empresa no está activa.",
      valores,
    };
  }
  revalidatePath("/portal/soporte");
  redirect(`/portal/soporte/${resultado.id}?nuevo=1`);
}

const esquemaRespuesta = z.object({
  incidenteId: z.uuid(),
  texto: z.string().trim().min(2, { error: "Escribí tu mensaje" }).max(5000),
});

export async function responderClienteAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirCliente();
  const valores = valoresDe(formData);
  const datos = esquemaRespuesta.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const resultado = await responderIncidente(
    await obtenerDb(),
    datos.data.incidenteId,
    { usuarioId: contexto.usuarioId, softeam: false, empresaId: contexto.empresaId },
    { texto: datos.data.texto },
  );
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error === "CERRADO"
          ? "El pedido está cerrado. Abrí uno nuevo si necesitás ayuda."
          : "El pedido ya no existe.",
      valores,
    };
  }
  revalidatePath(`/portal/soporte/${datos.data.incidenteId}`);
  return { ok: true, mensaje: "Mensaje enviado." };
}

export async function cerrarIncidenteAccion(formData: FormData): Promise<void> {
  const contexto = await requerirCliente();
  const id = z.uuid().safeParse(formData.get("incidenteId"));
  if (!id.success) return;
  await cambiarEstadoIncidente(
    await obtenerDb(),
    id.data,
    { usuarioId: contexto.usuarioId, softeam: false, empresaId: contexto.empresaId },
    "CERRADO",
  );
  revalidatePath(`/portal/soporte/${id.data}`);
  revalidatePath("/portal/soporte");
}
