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
  const marcado = (campo: string) => valores[campo] === "on";
  const datos = esquemaTicket.safeParse({
    ...valores,
    descripcion: valores.descripcion || undefined,
    tope: valores.tope || "0",
    minimo: valores.minimo || "0",
    usosMaximos: valores.usosMaximos || "0",
    paisId: valores.paisId || undefined,
    cliente: valores.cliente || undefined,
    observaciones: valores.observaciones || undefined,
    altaInicial: marcado("altaInicial"),
    adicional: marcado("adicional"),
    renovacion: marcado("renovacion"),
    publico: marcado("publico"),
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
    if (resultado.error === "CODIGO_EXISTENTE") {
      return { errores: { codigo: ["Ya existe un ticket con ese código."] }, valores };
    }
    if (resultado.error === "CLIENTE_INEXISTENTE") {
      return { errores: { cliente: ["No hay un cliente con ese CUIT o número."] }, valores };
    }
    return { mensaje: "Alguno de los paquetes elegidos ya no existe.", valores };
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
