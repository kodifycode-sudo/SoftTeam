"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  agregarAlGrupo,
  type ErrorGrupo,
  eliminarGrupo,
  esquemaGrupo,
  guardarGrupo,
  quitarDelGrupo,
} from "@/server/modules/cuentas/grupos";

const EDITORES = ["ADMINISTRACION", "COMERCIAL"] as const;

const MENSAJES: Record<ErrorGrupo, EstadoFormulario> = {
  NO_EXISTE: { mensaje: "El grupo ya no existe." },
  NOMBRE_CORTO_EXISTENTE: { errores: { nombreCorto: ["Ya hay un grupo con ese nombre corto."] } },
  PRINCIPAL_INEXISTENTE: { errores: { principal: ["No hay un cliente con ese CUIT o número."] } },
  FACTURACION_INEXISTENTE: {
    errores: { facturacion: ["No hay un cliente con ese CUIT o número."] },
  },
  FACTURACION_INACTIVA: { errores: { facturacion: ["Ese cliente está inactivo."] } },
  CLIENTE_INEXISTENTE: { errores: { cliente: ["No hay un cliente con ese CUIT o número."] } },
  EN_OTRO_GRUPO: { mensaje: "Ese cliente ya está en otro grupo: sacalo de ese grupo primero." },
  CON_MIEMBROS: { mensaje: "El grupo tiene clientes: sacalos antes de borrarlo." },
};

export async function guardarGrupoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(EDITORES);
  const valores = valoresDe(formData);
  const datos = esquemaGrupo.safeParse({
    ...valores,
    id: valores.id || undefined,
    principal: valores.principal || undefined,
    facturacion: valores.facturacion || undefined,
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const resultado = await guardarGrupo(await obtenerDb(), datos.data, user.id);
  if (!resultado.ok) return { ...MENSAJES[resultado.error], valores };
  revalidatePath("/admin/grupos", "layout");
  if (!datos.data.id) redirect(`/admin/grupos/${resultado.id}`);
  return { ok: true, mensaje: "Grupo actualizado." };
}

export async function agregarAlGrupoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(EDITORES);
  const valores = valoresDe(formData);
  const datos = z
    .object({
      grupoId: z.uuid(),
      cliente: z.string().trim().min(1, { error: "Ingresá el CUIT o número" }),
    })
    .safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const resultado = await agregarAlGrupo(
    await obtenerDb(),
    datos.data.grupoId,
    datos.data.cliente,
    user.id,
  );
  if (!resultado.ok) return { ...MENSAJES[resultado.error], valores };
  revalidatePath(`/admin/grupos/${datos.data.grupoId}`);
  return { ok: true, mensaje: `${resultado.nombre} se sumó al grupo.` };
}

export async function quitarDelGrupoAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(EDITORES);
  const datos = z.object({ grupoId: z.uuid(), clienteId: z.uuid() }).safeParse(valoresDe(formData));
  if (!datos.success) return;
  await quitarDelGrupo(await obtenerDb(), datos.data.grupoId, datos.data.clienteId, user.id);
  revalidatePath(`/admin/grupos/${datos.data.grupoId}`);
}

export async function eliminarGrupoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(EDITORES);
  const id = z.uuid().safeParse(formData.get("grupoId"));
  if (!id.success) return { mensaje: "Grupo inválido." };
  const resultado = await eliminarGrupo(await obtenerDb(), id.data, user.id);
  if (!resultado.ok) return MENSAJES[resultado.error];
  revalidatePath("/admin/grupos");
  redirect("/admin/grupos");
}
