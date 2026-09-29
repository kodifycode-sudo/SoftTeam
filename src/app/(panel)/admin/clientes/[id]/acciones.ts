"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  anidar,
  type EstadoFormulario,
  erroresPorCampo,
  erroresPorRuta,
  valoresDe,
} from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { guardarNotas } from "@/server/modules/cuentas/actividad";
import { esquemaNuevaEmpresa, nuevaEmpresaDeCliente } from "@/server/modules/cuentas/altas-softeam";
import {
  type ErrorEdicion,
  esquemaEdicionCliente,
  esquemaEdicionEmpresa,
  guardarCliente,
  guardarEmpresa,
} from "@/server/modules/cuentas/edicion";
import {
  asignarFacturacionOficina,
  type ErrorFacturacionOficina,
  type ErrorPedidoFacturacion,
  esquemaFacturacionOficina,
  resolverPedidoFacturacion,
} from "@/server/modules/cuentas/facturacion-oficinas";
import { enviarInvitacion } from "@/server/modules/cuentas/invitaciones";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

export async function guardarNotasAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam();
  const datos = z
    .object({
      empresaId: z.uuid(),
      clienteId: z.uuid(),
      notas: z.string().max(5000, { error: "Hasta 5.000 caracteres" }),
    })
    .safeParse(Object.fromEntries(formData));
  if (!datos.success) return { mensaje: datos.error.issues[0]?.message ?? "Datos inválidos." };
  await guardarNotas(await obtenerDb(), datos.data.empresaId, datos.data.notas, user.id);
  revalidatePath(`/admin/clientes/${datos.data.clienteId}`);
  return { ok: true, mensaje: "Notas guardadas." };
}

const MENSAJES_FACTURACION: Record<ErrorFacturacionOficina, string> = {
  OFICINA_INEXISTENTE: "La oficina ya no existe.",
  CLIENTE_INEXISTENTE: "No hay un cliente con ese CUIT o número.",
  CLIENTE_INACTIVO: "Ese cliente está inactivo.",
  MISMO_CLIENTE: "Es el cliente de la empresa: dejá el campo vacío.",
};

/** Cliente al que se facturan las compras delegadas de una oficina (Administración o Comercial). */
export async function asignarFacturacionOficinaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const valores = valoresDe(formData);
  const datos = esquemaFacturacionOficina.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const resultado = await asignarFacturacionOficina(await obtenerDb(), datos.data, user.id);
  if (!resultado.ok) {
    return { errores: { cliente: [MENSAJES_FACTURACION[resultado.error]] }, valores };
  }
  const clienteId = z.uuid().safeParse(valores.clienteId);
  if (clienteId.success) revalidatePath(`/admin/clientes/${clienteId.data}`);
  return {
    ok: true,
    mensaje: resultado.cliente
      ? `Las compras de la oficina se facturan a ${resultado.cliente.nombreFactura}.`
      : "Las compras de la oficina se facturan al cliente de la empresa.",
  };
}

const MENSAJES_PEDIDO: Partial<Record<ErrorPedidoFacturacion, string>> = {
  ...MENSAJES_FACTURACION,
  CLIENTE_INEXISTENTE:
    "Ese CUIT todavía no es cliente de STLic: tiene que registrarse antes de aprobar.",
  NO_EXISTE: "El pedido ya no existe.",
  NO_PENDIENTE: "El pedido ya fue resuelto o retirado.",
  FALTA_MOTIVO: "Contale a la empresa por qué no se aprueba.",
};

/** Aprueba o rechaza el pedido de facturación de una oficina (Administración o Comercial). */
export async function resolverPedidoFacturacionAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const valores = valoresDe(formData);
  const datos = z
    .object({
      solicitudId: z.uuid(),
      clienteId: z.uuid(),
      decision: z.enum(["aprobar", "rechazar"]),
      respuesta: z.string().max(300).optional(),
    })
    .safeParse(valores);
  if (!datos.success) return { mensaje: "Pedido inválido.", valores };
  const resultado = await resolverPedidoFacturacion(
    await obtenerDb(),
    {
      solicitudId: datos.data.solicitudId,
      aprobar: datos.data.decision === "aprobar",
      respuesta: datos.data.respuesta,
    },
    user.id,
  );
  if (!resultado.ok) {
    const mensaje = MENSAJES_PEDIDO[resultado.error] ?? "No se pudo resolver el pedido.";
    return resultado.error === "FALTA_MOTIVO"
      ? { errores: { respuesta: [mensaje] }, valores }
      : { mensaje, valores };
  }
  revalidatePath(`/admin/clientes/${datos.data.clienteId}`);
  return {
    ok: true,
    mensaje:
      datos.data.decision === "aprobar"
        ? "Pedido aprobado: ya rige la nueva facturación."
        : "Pedido rechazado. Le avisamos a la empresa.",
  };
}

const MENSAJES_EDICION: Record<ErrorEdicion, EstadoFormulario> = {
  NO_EXISTE: { mensaje: "Ya no existe." },
  CONFLICTO: {
    mensaje:
      "Alguien más lo modificó mientras lo editabas. Recargá la página para ver los cambios y volvé a aplicar los tuyos.",
  },
  CUIT_DUPLICADO: { errores: { cuit: ["Ya hay otro cliente con ese CUIT."] } },
  SIN_PERMISO: { mensaje: "Solo Administración puede cambiar el CUIT o dar de baja." },
  GRUPO_INVALIDO: { errores: { grupoId: ["Elegí un grupo económico de la lista."] } },
  MEDIO_INVALIDO: { mensaje: "Elegí medios de pago de la lista." },
};

/** Corrige los datos del cliente (Administración o Comercial). */
export async function guardarClienteAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user, rol } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const valores = valoresDe(formData);
  const clienteId = z.uuid().safeParse(valores.clienteId);
  if (!clienteId.success) return { mensaje: "Cliente inválido.", valores };
  const datos = esquemaEdicionCliente.safeParse({
    ...anidar(valores),
    activo: valores.activo === "on",
  });
  if (!datos.success) {
    return { errores: erroresPorRuta(datos.error), mensaje: "Revisá los datos marcados.", valores };
  }
  const resultado = await guardarCliente(await obtenerDb(), clienteId.data, datos.data, {
    usuarioId: user.id,
    administracion: rol === "ADMINISTRACION",
  });
  if (!resultado.ok) return { ...MENSAJES_EDICION[resultado.error], valores };
  revalidatePath(`/admin/clientes/${clienteId.data}`);
  redirect(`/admin/clientes/${clienteId.data}?aviso=guardado`);
}

/** Corrige los datos de una empresa (Administración o Comercial). */
export async function guardarEmpresaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user, rol } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const valores = valoresDe(formData);
  const ids = z.object({ empresaId: z.uuid(), clienteId: z.uuid() }).safeParse(valores);
  if (!ids.success) return { mensaje: "Empresa inválida.", valores };
  const datos = esquemaEdicionEmpresa.safeParse({ ...valores, activa: valores.activa === "on" });
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores,
    };
  }
  const resultado = await guardarEmpresa(await obtenerDb(), ids.data.empresaId, datos.data, {
    usuarioId: user.id,
    administracion: rol === "ADMINISTRACION",
  });
  if (!resultado.ok) return { ...MENSAJES_EDICION[resultado.error], valores };
  programarEntregaDeEventos();
  revalidatePath(`/admin/clientes/${ids.data.clienteId}`);
  return { ok: true, mensaje: "Empresa actualizada." };
}

/** Una empresa más para el cliente (Administración o Comercial). */
export async function nuevaEmpresaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const valores = valoresDe(formData);
  const clienteId = z.uuid().safeParse(valores.clienteId);
  if (!clienteId.success) return { mensaje: "Cliente inválido.", valores };
  const datos = esquemaNuevaEmpresa.safeParse(anidar(valores));
  if (!datos.success) {
    return { errores: erroresPorRuta(datos.error), mensaje: "Revisá los datos marcados.", valores };
  }
  const resultado = await nuevaEmpresaDeCliente(
    await obtenerDb(),
    clienteId.data,
    datos.data,
    user.id,
  );
  if (!resultado.ok) {
    return resultado.error === "ES_SOFTEAM"
      ? { errores: { "administrador.email": ["Ese mail es de un usuario de SOFTeam."] }, valores }
      : { mensaje: "El cliente ya no existe.", valores };
  }
  if (valores.invitar === "on") {
    await enviarInvitacion(resultado.usuario, `la cuenta de ${datos.data.empresa.nombre}`);
  }
  programarEntregaDeEventos();
  revalidatePath(`/admin/clientes/${clienteId.data}`);
  return { ok: true, mensaje: `Creamos la empresa ${datos.data.empresa.nombre}.` };
}
