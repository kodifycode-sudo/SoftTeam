"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { cambiarEstadoTicket, crearTicket, esquemaTicket } from "@/server/modules/catalogo/tickets";

export async function crearTicketAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaTicket.safeParse({
    ...valores,
    descripcion: valores.descripcion || undefined,
    paquetes: formData.getAll("paquetes").map(String),
  });
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores,
    };
  }
  const resultado = await crearTicket(await obtenerDb(), datos.data, user.id);
  if (!resultado.ok) {
    return resultado.error === "CODIGO_EXISTENTE"
      ? { errores: { codigo: ["Ya existe un ticket con ese código."] }, valores }
      : { mensaje: "Alguno de los paquetes elegidos ya no existe.", valores };
  }
  revalidatePath("/admin/tickets");
  return { ok: true, mensaje: `Ticket ${datos.data.codigo} creado.` };
}

export async function cambiarEstadoTicketAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const datos = z
    .object({ id: z.uuid(), activo: z.enum(["true", "false"]) })
    .safeParse(valoresDe(formData));
  if (!datos.success) return;
  await cambiarEstadoTicket(
    await obtenerDb(),
    datos.data.id,
    datos.data.activo === "true",
    user.id,
  );
  revalidatePath("/admin/tickets");
}
