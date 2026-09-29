"use server";

import { revalidatePath } from "next/cache";
import { MEDIOS_COMUNICACION, type MedioComunicacion } from "@/domain/comunicaciones/tipos";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirConfiguracionEmpresa } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  type ErrorTipoComunicacion,
  esquemaTipoComunicacion,
  guardarTipoComunicacion,
} from "@/server/modules/configuracion/comunicaciones";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

const MENSAJES: Record<ErrorTipoComunicacion, string> = {
  NO_EXISTE: "El tipo de comunicación no existe.",
  NOMBRE_EXISTENTE: "Ya hay un tipo de comunicación con ese nombre.",
};

function leerReglas(texto: string | undefined): unknown {
  try {
    return JSON.parse(texto ?? "[]");
  } catch {
    return [];
  }
}

/** Crea o modifica un tipo de comunicación (administración de toda la empresa). */
export async function guardarTipoComunicacionAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracionEmpresa();
  const valores = valoresDe(formData);
  const datos = esquemaTipoComunicacion.safeParse({
    id: valores.id || undefined,
    nombre: valores.nombre ?? "",
    medios: Object.fromEntries(
      (Object.keys(MEDIOS_COMUNICACION) as MedioComunicacion[]).map((m) => [
        m,
        valores[`medio-${m}`] === "on",
      ]),
    ),
    reglas: leerReglas(valores.reglas),
    activo: valores.activo === "on",
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const r = await guardarTipoComunicacion(
    await obtenerDb(),
    contexto.empresaId,
    datos.data,
    contexto.usuarioId,
  );
  if (!r.ok) return { errores: { nombre: [MENSAJES[r.error]] }, valores };
  programarEntregaDeEventos();
  revalidatePath("/portal/comunicaciones");
  return {
    ok: true,
    mensaje: datos.data.id ? "Tipo de comunicación guardado." : "Tipo de comunicación creado.",
  };
}
