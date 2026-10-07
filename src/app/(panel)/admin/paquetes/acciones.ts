"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  cambiarActivoPaquete,
  type ErrorGuardarPaquete,
  esquemaPaquete,
  guardarPaquete,
} from "@/server/modules/catalogo/paquetes";

const MENSAJES: Record<ErrorGuardarPaquete, string> = {
  CODIGO_DUPLICADO: "Ya existe otro paquete con ese código.",
  RECURSO_INCOMPATIBLE:
    "Un paquete temporal no puede incluir saldos sin vencimiento, y uno consumible solo puede incluir saldos.",
  SIN_RECURSOS: "El paquete tiene que incluir al menos un límite con cantidad mayor a cero.",
  NO_EXISTE: "El paquete ya no existe.",
};

/** Alta y edición: solo Administración SOFTeam. */
export async function guardarPaqueteAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);

  const recursos: Record<string, string> = {};
  for (const [clave, valor] of formData.entries()) {
    if (clave.startsWith("recurso:") && typeof valor === "string" && valor !== "") {
      recursos[clave.slice("recurso:".length)] = valor;
    }
  }
  let alternativas: unknown = [];
  try {
    alternativas = JSON.parse(String(formData.get("alternativas") ?? "[]"));
  } catch {
    return { mensaje: "Las alternativas enviadas no son válidas." };
  }

  const id = z
    .uuid()
    .optional()
    .safeParse(formData.get("id") || undefined);
  const datos = esquemaPaquete.safeParse({
    codigo: formData.get("codigo"),
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion") || undefined,
    tipo: formData.get("tipo"),
    privado: formData.get("privado") === "on",
    destacado: formData.get("destacado") === "on",
    activo: formData.get("activo") === "on",
    ventaDesde: formData.get("ventaDesde"),
    ventaHasta: formData.get("ventaHasta") || undefined,
    recursos,
    alternativas,
  });
  if (!id.success || !datos.success) {
    const errores: Record<string, string[]> = {};
    for (const issue of datos.error?.issues ?? []) {
      const clave = issue.path.join(".");
      errores[clave] = [...(errores[clave] ?? []), issue.message];
    }
    return { errores, mensaje: "Revisá los datos marcados." };
  }

  const db = await obtenerDb();
  const resultado = await guardarPaquete(db, { ...datos.data, id: id.data, paisId: "AR" }, user.id);
  if (!resultado.ok) return { mensaje: MENSAJES[resultado.error] };

  revalidatePath("/admin/paquetes");
  revalidatePath("/portal/paquetes");
  redirect("/admin/paquetes?guardado=1");
}

/** Activar o inactivar para la venta: Administración y Comercial. */
export async function cambiarActivoAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const datos = z
    .object({ id: z.uuid(), activo: z.enum(["true", "false"]) })
    .parse({ id: formData.get("id"), activo: formData.get("activo") });
  const db = await obtenerDb();
  await cambiarActivoPaquete(db, datos.id, datos.activo === "true", user.id);
  revalidatePath("/admin/paquetes");
  revalidatePath("/portal/paquetes");
}
