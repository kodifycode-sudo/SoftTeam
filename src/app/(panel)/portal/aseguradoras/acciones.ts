"use server";

import { revalidatePath } from "next/cache";
import { fechaCorta } from "@/lib/formato";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirConfiguracionEmpresa } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  cambiarAseguradora,
  type ErrorAseguradora,
  esquemaCambioAseguradora,
} from "@/server/modules/configuracion/aseguradoras";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

const NOMBRE = { prodigal: "Prodigal", cotiweb: "CotiWeb" } as const;

export async function cambiarAseguradoraAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracionEmpresa();
  const datos = esquemaCambioAseguradora.safeParse({
    aseguradoraId: formData.get("aseguradoraId"),
    cambio: formData.get("cambio"),
    valor: formData.get("valor") === "true",
  });
  if (!datos.success) return { mensaje: "Cambio inválido." };
  const db = await obtenerDb();
  const resultado = await cambiarAseguradora(
    db,
    contexto.empresaId,
    datos.data,
    contexto.usuarioId,
  );
  if (!resultado.ok) {
    const producto = datos.data.cambio === "trabaja" ? "" : NOMBRE[datos.data.cambio];
    const mensajes: Record<ErrorAseguradora, string> = {
      NO_EXISTE: "La aseguradora ya no está disponible.",
      NO_DISPONIBLE: `Esta aseguradora todavía no tiene interfaz con ${producto}.`,
      NO_TRABAJA: "Primero marcá que trabajás con esta aseguradora.",
      DISCONTINUADA:
        "Esta aseguradora fue discontinuada: ya no se pueden activar interfaces nuevas.",
      SIN_LICENCIA: `Tu licencia no incluye interfaces de ${producto}.`,
      LIMITE_ALCANZADO: `Ya usás todas las interfaces de ${producto} (${resultado.detalle}). Dá de baja una o sumá interfaces con un paquete.`,
    };
    return { mensaje: mensajes[resultado.error] };
  }
  programarEntregaDeEventos();
  revalidatePath("/portal/aseguradoras");
  if (resultado.bajaDesde) {
    return {
      ok: true,
      mensaje: `La interfaz sigue activa hasta fin de mes: la baja rige el ${fechaCorta(resultado.bajaDesde)}.`,
    };
  }
  return { ok: true, mensaje: "Cambio guardado." };
}
