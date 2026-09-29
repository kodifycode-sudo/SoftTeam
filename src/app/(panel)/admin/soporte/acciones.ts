"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { enviarAlertasPendientes } from "@/server/modules/procesos/alertas";
import { enviarAlertaPorMail } from "@/server/modules/procesos/mail";
import { adjuntosDelFormulario } from "@/server/modules/soporte/adjuntos";
import {
  asignarIncidente,
  cambiarEstadoIncidente,
  responderIncidente,
} from "@/server/modules/soporte/incidentes";

const ATIENDEN = ["ADMINISTRACION", "SOPORTE"] as const;

const esquemaRespuesta = z.object({
  incidenteId: z.uuid(),
  texto: z.string().trim().min(2, { error: "Escribí el mensaje" }).max(5000),
});

export async function responderSofteamAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(ATIENDEN);
  const valores = valoresDe(formData);
  const datos = esquemaRespuesta.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const adjuntos = await adjuntosDelFormulario(formData);
  if (!adjuntos.ok) return { errores: { adjuntos: [adjuntos.mensaje] }, valores };
  const interno = valores.interno === "on";
  const db = await obtenerDb();
  const resultado = await responderIncidente(
    db,
    datos.data.incidenteId,
    { usuarioId: user.id, softeam: true },
    { texto: datos.data.texto, interno, adjuntos: adjuntos.adjuntos },
  );
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error === "CERRADO" ? "El pedido está cerrado." : "El pedido ya no existe.",
      valores,
    };
  }
  // El cliente recibe el aviso por mail en el momento.
  if (!interno) await enviarAlertasPendientes(db, enviarAlertaPorMail);
  revalidatePath(`/admin/soporte/${datos.data.incidenteId}`);
  return {
    ok: true,
    mensaje: interno ? "Nota interna guardada." : "Respuesta enviada al cliente.",
  };
}

const ESTADOS = ["ABIERTO", "EN_CURSO", "ESPERANDO_CLIENTE", "RESUELTO", "CERRADO"] as const;

export async function cambiarEstadoSoporteAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(ATIENDEN);
  const datos = z
    .object({ incidenteId: z.uuid(), estado: z.enum(ESTADOS) })
    .safeParse(valoresDe(formData));
  if (!datos.success) return;
  await cambiarEstadoIncidente(
    await obtenerDb(),
    datos.data.incidenteId,
    { usuarioId: user.id, softeam: true },
    datos.data.estado,
  );
  revalidatePath(`/admin/soporte/${datos.data.incidenteId}`);
  revalidatePath("/admin/soporte");
}

export async function asignarSoporteAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(ATIENDEN);
  const datos = z
    .object({ incidenteId: z.uuid(), usuarioId: z.string().max(64) })
    .safeParse(valoresDe(formData));
  if (!datos.success) return;
  await asignarIncidente(
    await obtenerDb(),
    datos.data.incidenteId,
    datos.data.usuarioId || null,
    user.id,
  );
  revalidatePath(`/admin/soporte/${datos.data.incidenteId}`);
  revalidatePath("/admin/soporte");
}
