"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { enviarInvitacion } from "@/server/modules/cuentas/invitaciones";
import { buscarUsuarioPorEmail } from "@/server/modules/cuentas/usuarios";
import {
  cambiarRolSofteam,
  type ErrorUsuarioSofteam,
  esquemaInvitacionSofteam,
  invitarUsuarioSofteam,
  ROLES_SOFTEAM,
} from "@/server/modules/cuentas/usuarios-softeam";

const MENSAJES: Record<ErrorUsuarioSofteam, string> = {
  YA_EXISTE: "Esa persona ya tiene acceso al panel SOFTeam.",
  ES_CLIENTE: "Ese mail administra una cuenta de cliente. Usá otro mail para el acceso de SOFTeam.",
  NO_EXISTE: "El usuario ya no existe.",
  PROPIO: "No podés cambiar tu propio rol ni quitarte el acceso.",
  ULTIMO_ADMIN: "Tiene que quedar al menos una persona de Administración.",
};

export async function invitarUsuarioAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaInvitacionSofteam.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const db = await obtenerDb();
  const resultado = await invitarUsuarioSofteam(db, datos.data, user.id);
  if (!resultado.ok) {
    return { errores: { email: [MENSAJES[resultado.error]] }, valores };
  }
  await enviarInvitacion(resultado.usuario, "el panel de SOFTeam");
  revalidatePath("/admin/usuarios");
  return { ok: true, mensaje: `Invitamos a ${resultado.usuario.email}.` };
}

const esquemaRol = z.object({
  id: z.string().min(1),
  rol: z.enum([...ROLES_SOFTEAM, "SIN_ACCESO"]),
});

export async function cambiarRolAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const datos = esquemaRol.safeParse(valoresDe(formData));
  if (!datos.success) return { mensaje: "Elegí un rol." };
  const db = await obtenerDb();
  const rol = datos.data.rol === "SIN_ACCESO" ? null : datos.data.rol;
  const resultado = await cambiarRolSofteam(db, datos.data.id, rol, user.id);
  if (!resultado.ok) return { mensaje: MENSAJES[resultado.error] };
  revalidatePath("/admin/usuarios");
  return {
    ok: true,
    mensaje: rol ? "Rol actualizado." : "Quitamos el acceso y cerramos sus sesiones.",
  };
}

export async function reenviarInvitacionAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requerirSofteam(["ADMINISTRACION"]);
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { mensaje: "Falta el mail." };
  const db = await obtenerDb();
  const usuario = await buscarUsuarioPorEmail(db, email.data);
  if (!usuario?.rolSofteam) return { mensaje: MENSAJES.NO_EXISTE };
  await enviarInvitacion(
    {
      id: usuario.id,
      nombre: usuario.name,
      email: usuario.email,
      verificado: usuario.emailVerified,
      rolSofteam: usuario.rolSofteam,
      nuevo: false,
    },
    "el panel de SOFTeam",
  );
  return { ok: true, mensaje: `Reenviamos la invitación a ${usuario.email}.` };
}
