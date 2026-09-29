"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirCliente, requerirComercial, requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  cancelarPedidoFacturacion,
  type ErrorPedidoFacturacion,
  esquemaPedidoFacturacion,
  pedidoFacturacionHabilitado,
  pedirFacturacionOficina,
} from "@/server/modules/cuentas/facturacion-oficinas";
import {
  crearOficina,
  type ErrorEdicionOficina,
  editarOficina,
  esquemaEdicionOficina,
  esquemaOficina,
  renombrarCanal,
} from "@/server/modules/cuentas/oficinas";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

export async function crearOficinaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirCliente();
  const { alcance } = contexto;
  if ((!contexto.adminGeneral && !contexto.adminOperativo) || alcance.tipo === "oficina") {
    return { mensaje: "No tenés permiso para configurar oficinas." };
  }
  const valores = valoresDe(formData);
  const nuevoCanal = valores.canalId === "nuevo";
  // Un delegado de canal solo suma oficinas a su canal.
  if (alcance.tipo === "canal" && (nuevoCanal || valores.canalId !== alcance.canalId)) {
    return { errores: { canalId: ["Solo podés crear oficinas en tu canal."] }, valores };
  }
  const datos = esquemaOficina.safeParse({
    nombre: valores.nombre,
    telefono: valores.telefono || undefined,
    domicilio: valores.domicilio || undefined,
    canalId: nuevoCanal ? undefined : valores.canalId || undefined,
    canalNuevo: nuevoCanal ? valores.canalNuevo : undefined,
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  if (nuevoCanal && !datos.data.canalNuevo) {
    return { errores: { canalNuevo: ["Ingresá el nombre del canal"] }, valores };
  }

  const db = await obtenerDb();
  const resultado = await crearOficina(db, contexto.empresaId, datos.data, contexto.usuarioId);
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error === "CANAL_INVALIDO"
          ? "El canal elegido no es válido."
          : "No quedan códigos disponibles en ese canal.",
      valores,
    };
  }
  programarEntregaDeEventos();
  revalidatePath("/portal/oficinas");
  return { ok: true, mensaje: `Oficina ${resultado.codigo} creada.` };
}

const MENSAJES_PEDIDO: Partial<Record<ErrorPedidoFacturacion, EstadoFormulario>> = {
  OFICINA_INEXISTENTE: { mensaje: "La oficina ya no existe o no la administrás." },
  YA_PENDIENTE: { mensaje: "Ya hay un pedido pendiente para esta oficina." },
  SIN_CAMBIO: { errores: { cuit: ["La oficina ya se factura así."] } },
  MISMO_CLIENTE: { errores: { cuit: ["Es el CUIT de la empresa: dejalo vacío."] } },
};

/** Pide a SOFTeam facturar las compras de una oficina a otro CUIT (permiso comercial). */
export async function pedirFacturacionAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirComercial();
  const db = await obtenerDb();
  if (!(await pedidoFacturacionHabilitado(db))) {
    return { mensaje: "Para cambiar la facturación de una oficina, escribile a SOFTeam." };
  }
  const valores = valoresDe(formData);
  const datos = esquemaPedidoFacturacion.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const resultado = await pedirFacturacionOficina(db, contexto.empresaId, datos.data, {
    usuarioId: contexto.usuarioId,
    alcance: contexto.alcance,
  });
  if (!resultado.ok) {
    return {
      ...(MENSAJES_PEDIDO[resultado.error] ?? { mensaje: "No se pudo enviar el pedido." }),
      valores,
    };
  }
  revalidatePath("/portal/oficinas");
  return { ok: true, mensaje: "Enviamos el pedido a SOFTeam. Te avisamos cuando lo resuelva." };
}

export async function cancelarPedidoFacturacionAccion(formData: FormData): Promise<void> {
  const contexto = await requerirComercial();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await cancelarPedidoFacturacion(await obtenerDb(), contexto.empresaId, id.data, {
    usuarioId: contexto.usuarioId,
    alcance: contexto.alcance,
  });
  revalidatePath("/portal/oficinas");
}

const MENSAJES_OFICINA: Record<ErrorEdicionOficina, string> = {
  NO_EXISTE: "La oficina ya no existe o no la administrás.",
  SIN_PERMISO: "No podés desactivar la oficina que administrás.",
  ULTIMA_OFICINA: "La empresa tiene que conservar al menos una oficina activa.",
};

/** Edita o desactiva una oficina (permiso de configuración, dentro del alcance). */
export async function editarOficinaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracion();
  const valores = valoresDe(formData);
  const id = z.uuid().safeParse(valores.oficinaId);
  if (!id.success) return { mensaje: "Oficina inválida.", valores };
  const datos = esquemaEdicionOficina.safeParse({
    ...valores,
    notifica: valores.notifica === "on",
    activa: valores.activa === "on",
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const resultado = await editarOficina(
    await obtenerDb(),
    contexto.empresaId,
    id.data,
    datos.data,
    {
      usuarioId: contexto.usuarioId,
      alcance: contexto.alcance,
    },
  );
  if (!resultado.ok) return { mensaje: MENSAJES_OFICINA[resultado.error], valores };
  programarEntregaDeEventos();
  revalidatePath("/portal/oficinas");
  return { ok: true, mensaje: "Oficina actualizada." };
}

/** Renombra un canal (toda la empresa o el delegado de ese canal). */
export async function renombrarCanalAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirConfiguracion();
  const valores = valoresDe(formData);
  const datos = z
    .object({
      canalId: z.uuid(),
      nombre: z.string().trim().min(2, { error: "Ingresá el nombre" }).max(60),
    })
    .safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const ok = await renombrarCanal(
    await obtenerDb(),
    contexto.empresaId,
    datos.data.canalId,
    datos.data.nombre,
    { usuarioId: contexto.usuarioId, alcance: contexto.alcance },
  );
  if (!ok) return { mensaje: "No podés renombrar ese canal.", valores };
  programarEntregaDeEventos();
  revalidatePath("/portal/oficinas");
  return { ok: true, mensaje: "Canal renombrado." };
}
