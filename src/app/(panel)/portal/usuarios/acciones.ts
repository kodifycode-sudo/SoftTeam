"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { type ContextoCliente, requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import * as t from "@/server/db/schema";
import {
  type Actor,
  cambiarEstadoColaborador,
  esquemaColaborador,
  guardarColaborador,
  type ResultadoColaborador,
} from "@/server/modules/configuracion/colaboradores";
import { NOMBRE_PRODUCTO } from "@/server/modules/configuracion/limites";
import { enviarInvitacion } from "@/server/modules/cuentas/invitaciones";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

const actorDe = (c: ContextoCliente): Actor => ({
  usuarioId: c.usuarioId,
  colaboradorId: c.colaboradorId,
  adminGeneral: c.adminGeneral,
  adminComercial: c.adminComercial,
  adminOperativo: c.adminOperativo,
});

/** Traduce un rechazo a un mensaje (general o de un campo). */
function rechazo(
  r: Extract<ResultadoColaborador, { ok: false }>,
  valores?: Record<string, string>,
): EstadoFormulario {
  const producto = r.producto ? NOMBRE_PRODUCTO[r.producto] : "";
  switch (r.error) {
    case "EMAIL_DUPLICADO":
      return { errores: { email: ["Ya hay un usuario con este mail en la empresa."] }, valores };
    case "ES_SOFTEAM":
      return { errores: { email: ["Ese mail es de un usuario de SOFTeam."] }, valores };
    case "PRODIGAL_DUPLICADO":
      return { errores: { usuarioProdigal: ["Ese usuario de Prodigal ya está en uso."] }, valores };
    case "ALCANCE_INVALIDO":
      return { errores: { alcance: ["Elegí un canal u oficina de la empresa."] }, valores };
    case "LIMITE_ALCANZADO":
      return {
        mensaje: `Ya usás todos los usuarios de ${producto} (${r.detalle}). Dá de baja a alguien o sumá usuarios con un paquete.`,
        valores,
      };
    case "SIN_LICENCIA":
      return { mensaje: `${producto} no está incluido en tu licencia vigente.`, valores };
    case "SIN_PERMISO":
      return {
        mensaje: "Solo un administrador general puede dar o quitar permisos de administración.",
        valores,
      };
    case "PROPIO":
      return { mensaje: "No podés quitarte permisos ni darte de baja a vos mismo.", valores };
    case "ULTIMO_ADMIN":
      return {
        mensaje: "La empresa tiene que tener al menos un administrador general activo.",
        valores,
      };
    case "NO_EXISTE":
      return { mensaje: "El usuario ya no existe." };
  }
}

async function despuesDeGuardar(
  contexto: ContextoCliente,
  resultado: Extract<ResultadoColaborador, { ok: true }>,
) {
  if (resultado.invitar) {
    await enviarInvitacion(resultado.invitar, `la cuenta de ${contexto.empresaNombre}`);
  }
  programarEntregaDeEventos();
  revalidatePath("/portal/usuarios");
}

export async function guardarColaboradorAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracion();
  const valores = valoresDe(formData);
  const marcado = (campo: string) => valores[campo] === "on";
  const datos = esquemaColaborador.safeParse({
    ...valores,
    id: valores.id || undefined,
    iniciales: valores.iniciales || undefined,
    telefono: valores.telefono || undefined,
    usuarioProdigal: valores.usuarioProdigal || undefined,
    adminGeneral: marcado("adminGeneral"),
    adminComercial: marcado("adminComercial"),
    adminOperativo: marcado("adminOperativo"),
    accesoProdigal: marcado("accesoProdigal"),
    accesoCotiweb: marcado("accesoCotiweb"),
    accesoBienseguro: marcado("accesoBienseguro"),
    accesoBoletin: marcado("accesoBoletin"),
  });
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores,
    };
  }
  const db = await obtenerDb();
  const resultado = await guardarColaborador(db, contexto.empresaId, datos.data, actorDe(contexto));
  if (!resultado.ok) return rechazo(resultado, valores);
  await despuesDeGuardar(contexto, resultado);
  return {
    ok: true,
    mensaje: resultado.invitar
      ? `Guardado. Le enviamos a ${resultado.invitar.email} el acceso a STLic.`
      : datos.data.id
        ? "Usuario actualizado."
        : "Usuario creado.",
  };
}

export async function cambiarEstadoColaboradorAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracion();
  const datos = z
    .object({ id: z.uuid(), activo: z.enum(["true", "false"]) })
    .safeParse(valoresDe(formData));
  if (!datos.success) return { mensaje: "Usuario inválido." };
  const activo = datos.data.activo === "true";
  const db = await obtenerDb();
  const resultado = await cambiarEstadoColaborador(
    db,
    contexto.empresaId,
    datos.data.id,
    activo,
    actorDe(contexto),
  );
  if (!resultado.ok) return rechazo(resultado);
  await despuesDeGuardar(contexto, resultado);
  return { ok: true, mensaje: activo ? "Usuario reactivado." : "Usuario dado de baja." };
}

export async function reenviarInvitacionColaboradorAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracion();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { mensaje: "Usuario inválido." };
  const db = await obtenerDb();
  const [fila] = await db
    .select({ nombre: t.colaboradores.nombre, activo: t.colaboradores.activo, usuario: t.usuarios })
    .from(t.colaboradores)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.colaboradores.usuarioId))
    .where(and(eq(t.colaboradores.id, id.data), eq(t.colaboradores.empresaId, contexto.empresaId)));
  if (!fila?.activo) return { mensaje: "Ese usuario no tiene acceso a STLic." };
  await enviarInvitacion(
    {
      id: fila.usuario.id,
      nombre: fila.nombre,
      email: fila.usuario.email,
      verificado: fila.usuario.emailVerified,
      rolSofteam: fila.usuario.rolSofteam,
      nuevo: false,
    },
    `la cuenta de ${contexto.empresaNombre}`,
  );
  return { ok: true, mensaje: `Reenviamos el acceso a ${fila.usuario.email}.` };
}
