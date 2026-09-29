"use server";

import { revalidatePath } from "next/cache";
import { fechaCorta } from "@/lib/formato";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirConfiguracionEmpresa } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  agregarAseguradoras,
  cambiarAseguradora,
  type ErrorAseguradora,
  esquemaAgregarAseguradoras,
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

const QUE = {
  trabaja: "",
  prodigal: "la interfaz con Prodigal de ",
  cotiweb: "la interfaz con CotiWeb de ",
};

const MOTIVO: Record<ErrorAseguradora, string> = {
  NO_EXISTE: "ya no está en el catálogo",
  NO_DISPONIBLE: "todavía no tiene esa interfaz",
  NO_TRABAJA: "no quedó agregada",
  DISCONTINUADA: "fue discontinuada",
  SIN_LICENCIA: "tu licencia no incluye esas interfaces",
  LIMITE_ALCANZADO: "ya usás todas las interfaces licenciadas",
};

/** Agrega una o varias aseguradoras del catálogo (y, si se pide, sus interfaces). */
export async function agregarAseguradorasAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracionEmpresa();
  const datos = esquemaAgregarAseguradoras.safeParse({
    aseguradoraIds: formData.getAll("aseguradoraIds").map(String),
    prodigal: formData.get("prodigal") === "on",
    cotiweb: formData.get("cotiweb") === "on",
  });
  if (!datos.success) return { mensaje: datos.error.issues[0]?.message ?? "Elegí aseguradoras." };
  const r = await agregarAseguradoras(
    await obtenerDb(),
    contexto.empresaId,
    datos.data,
    contexto.usuarioId,
  );
  if (r.agregadas > 0) {
    programarEntregaDeEventos();
    revalidatePath("/portal/aseguradoras");
  }
  const avisos = r.avisos.map((a) => `No se agregó ${QUE[a.que]}${a.nombre}: ${MOTIVO[a.error]}.`);
  const agregadas =
    r.agregadas === 1 ? "Agregamos 1 aseguradora." : `Agregamos ${r.agregadas} aseguradoras.`;
  return {
    ok: r.agregadas > 0,
    mensaje: [r.agregadas > 0 ? agregadas : "", ...avisos].filter(Boolean).join(" "),
  };
}
