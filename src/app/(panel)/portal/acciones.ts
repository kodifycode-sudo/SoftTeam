"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/formulario";
import {
  COOKIE_EMPRESA,
  COOKIE_OFICINA_COMPRA,
  requerirCliente,
  requerirComercial,
} from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { marcarAvisosLeidos } from "@/server/modules/procesos/alertas";
import { cambiarRenovacionAutomatica } from "@/server/modules/procesos/renovacion-automatica";

/** Cambia la empresa activa (solo entre las que el usuario administra). */
export async function elegirEmpresa(formData: FormData): Promise<void> {
  const contexto = await requerirCliente();
  const empresaId = String(formData.get("empresaId") ?? "");
  if (!contexto.empresas.some((e) => e.id === empresaId)) return;
  (await cookies()).set(COOKIE_EMPRESA, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect("/portal");
}

/** Delegado de canal: elige para qué oficina compra (solo entre las de su canal). */
export async function elegirOficinaCompra(formData: FormData): Promise<void> {
  const contexto = await requerirComercial();
  const oficinaId = String(formData.get("oficinaId") ?? "");
  if (!contexto.oficinasCompra.some((o) => o.id === oficinaId)) return;
  (await cookies()).set(COOKIE_OFICINA_COMPRA, oficinaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  revalidatePath("/portal", "layout");
}

/** Activa o desactiva la renovación automática de un paquete (permiso comercial). */
export async function cambiarRenovacionAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirComercial();
  const datos = z
    .object({ contratoId: z.uuid(), renovar: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(formData));
  if (!datos.success) return { mensaje: "Cambio inválido." };
  const renovar = datos.data.renovar === "true";
  const resultado = await cambiarRenovacionAutomatica(
    await obtenerDb(),
    contexto.empresaId,
    datos.data.contratoId,
    renovar,
    contexto.usuarioId,
    contexto.alcance,
  );
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error === "YA_RENOVADO"
          ? "La orden de renovación ya se generó. Para no renovar, pedile a SOFTeam que la cancele."
          : "El paquete ya no está vigente.",
    };
  }
  revalidatePath("/portal");
  return {
    ok: true,
    mensaje: renovar
      ? "Listo: el paquete se renueva solo."
      : "Listo: el paquete no se renueva ni te avisamos su vencimiento.",
  };
}

/** Marca como leídos los avisos de la empresa (todos o uno). */
export async function marcarAvisosLeidosAccion(formData: FormData): Promise<void> {
  const contexto = await requerirCliente();
  const id = z.uuid().safeParse(formData.get("id"));
  await marcarAvisosLeidos(
    await obtenerDb(),
    contexto.empresaId,
    id.success ? id.data : undefined,
    contexto.alcance,
  );
  revalidatePath("/portal", "layout");
}
