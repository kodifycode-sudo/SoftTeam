"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  agregarCodigo,
  cambiarEstadoProductor,
  type ErrorCodigo,
  type ErrorProductor,
  esquemaCodigo,
  esquemaProductor,
  guardarProductor,
  quitarCodigo,
} from "@/server/modules/configuracion/productores";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

const ERRORES_PRODUCTOR: Record<ErrorProductor, EstadoFormulario["errores"] | string> = {
  NO_EXISTE: "El productor ya no existe.",
  OFICINA_INVALIDA: { oficinaId: ["Elegí una oficina de la empresa."] },
  CUIT_DUPLICADO: { cuit: ["Ya hay un productor con este CUIT."] },
  SIN_INSTITORIO: {
    agenteInstitorio: ["Tu licencia no incluye agente institorio (lo trae Prodigal Full)."],
  },
};

export async function guardarProductorAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracion();
  const valores = valoresDe(formData);
  const vacio = (campo: string) => valores[campo] || undefined;
  const datos = esquemaProductor.safeParse({
    id: vacio("id"),
    nombre: valores.nombre,
    matricula: vacio("matricula"),
    tipoPersona: vacio("tipoPersona"),
    cuit: vacio("cuit"),
    condicionIva: vacio("condicionIva"),
    email: vacio("email"),
    telefono: vacio("telefono"),
    celular: vacio("celular"),
    domicilio: vacio("domicilio"),
    oficinaId: vacio("oficinaId"),
    esProductor: valores.esProductor === "on",
    esOrganizador: valores.esOrganizador === "on",
    esSubproductor: valores.esSubproductor === "on",
    agenteInstitorio: valores.agenteInstitorio === "on",
  });
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores,
    };
  }
  const db = await obtenerDb();
  const resultado = await guardarProductor(db, contexto.empresaId, datos.data, contexto.usuarioId);
  if (!resultado.ok) {
    const error = ERRORES_PRODUCTOR[resultado.error];
    return typeof error === "string"
      ? { mensaje: error, valores }
      : { errores: error, mensaje: "Revisá los datos marcados.", valores };
  }
  programarEntregaDeEventos();
  revalidatePath("/portal/productores");
  if (!datos.data.id) redirect(`/portal/productores/${resultado.id}?aviso=creado`);
  return { ok: true, mensaje: "Productor actualizado." };
}

export async function cambiarEstadoProductorAccion(formData: FormData): Promise<void> {
  const contexto = await requerirConfiguracion();
  const datos = z
    .object({ id: z.uuid(), activo: z.enum(["true", "false"]) })
    .safeParse(valoresDe(formData));
  if (!datos.success) return;
  const db = await obtenerDb();
  await cambiarEstadoProductor(
    db,
    contexto.empresaId,
    datos.data.id,
    datos.data.activo === "true",
    contexto.usuarioId,
  );
  programarEntregaDeEventos();
  revalidatePath("/portal/productores");
  revalidatePath(`/portal/productores/${datos.data.id}`);
}

const ERRORES_CODIGO: Record<ErrorCodigo, EstadoFormulario> = {
  NO_EXISTE: { mensaje: "El productor ya no existe." },
  NO_TRABAJA: { errores: { aseguradoraId: ["Primero marcá que trabajás con esta aseguradora."] } },
  DUPLICADO: { errores: { codigo: ["Ese código ya está cargado para esta aseguradora."] } },
  ROL_INVALIDO: {
    errores: { rol: ["Ese rol no coincide con los roles del productor."] },
  },
};

export async function agregarCodigoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracion();
  const valores = valoresDe(formData);
  const datos = esquemaCodigo.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const db = await obtenerDb();
  const resultado = await agregarCodigo(db, contexto.empresaId, datos.data, contexto.usuarioId);
  if (!resultado.ok) return { ...ERRORES_CODIGO[resultado.error], valores };
  programarEntregaDeEventos();
  revalidatePath(`/portal/productores/${datos.data.productorId}`);
  return { ok: true, mensaje: `Código ${datos.data.codigo} agregado.` };
}

export async function quitarCodigoAccion(formData: FormData): Promise<void> {
  const contexto = await requerirConfiguracion();
  const datos = z.object({ id: z.uuid(), productorId: z.uuid() }).safeParse(valoresDe(formData));
  if (!datos.success) return;
  const db = await obtenerDb();
  await quitarCodigo(db, contexto.empresaId, datos.data.id, contexto.usuarioId);
  programarEntregaDeEventos();
  revalidatePath(`/portal/productores/${datos.data.productorId}`);
}
