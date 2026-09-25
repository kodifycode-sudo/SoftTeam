"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";
import { cancelarOrden, registrarPago } from "@/server/modules/ventas/ordenes";

const MENSAJES = {
  NO_EXISTE: "La orden ya no existe.",
  NO_PENDIENTE: "La orden ya no está pendiente de pago.",
} as const;

/*
 * Tras una acción exitosa se redirige a la orden con un aviso en la URL: la
 * página lo muestra aunque el panel de acciones ya no esté (una orden pagada
 * o cancelada no lo tiene).
 */

export async function registrarPagoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const id = z.uuid().safeParse(formData.get("ordenId"));
  if (!id.success) return { mensaje: "Orden inválida." };
  const db = await obtenerDb();
  const resultado = await registrarPago(db, id.data, user.id);
  if (!resultado.ok) return { mensaje: MENSAJES[resultado.error] };
  programarEntregaDeEventos();
  revalidatePath("/admin/ordenes", "layout");
  redirect(`/admin/ordenes/${id.data}?aviso=pago&activados=${resultado.valor.contratosActivados}`);
}

export async function cancelarOrdenAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const datos = z
    .object({
      ordenId: z.uuid(),
      motivo: z.string().trim().min(5, { error: "Contá brevemente por qué se cancela" }).max(300),
    })
    .safeParse({ ordenId: formData.get("ordenId"), motivo: formData.get("motivo") });
  if (!datos.success) {
    return { errores: { motivo: datos.error.issues.map((i) => i.message) } };
  }
  const db = await obtenerDb();
  const resultado = await cancelarOrden(db, datos.data.ordenId, user.id, datos.data.motivo);
  if (!resultado.ok) return { mensaje: MENSAJES[resultado.error] };
  programarEntregaDeEventos();
  revalidatePath("/admin/ordenes", "layout");
  redirect(`/admin/ordenes/${datos.data.ordenId}?aviso=cancelada`);
}
