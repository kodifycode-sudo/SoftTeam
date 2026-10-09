"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { reenvioPermitido } from "@/server/auth/limites";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerFacturador, obtenerPasarela, urlBase } from "@/server/cobros";
import { obtenerDb } from "@/server/db";
import { facturarOrden } from "@/server/modules/cobros/facturacion";
import { reenviarLinkDePago } from "@/server/modules/cobros/pagos";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";
import { enviarAlertasPendientes } from "@/server/modules/procesos/alertas";
import { enviarAlertaPorMail } from "@/server/modules/procesos/mail";
import {
  bonificarContrato,
  type ErrorBonificacion,
  esquemaBonificacion,
} from "@/server/modules/ventas/bonificacion";
import { cancelarOrden, marcarOrdenRevisada, registrarPago } from "@/server/modules/ventas/ordenes";

const MENSAJES = {
  NO_EXISTE: "La orden ya no existe.",
  NO_PENDIENTE: "La orden ya no está pendiente de pago.",
} as const;

/*
 * Tras una acción exitosa se redirige a la orden con un aviso en la URL: la
 * página lo muestra aunque el panel de acciones ya no esté (una orden pagada
 * o cancelada no lo tiene).
 */

export async function registrarPagoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const id = z.uuid().safeParse(formData.get("ordenId"));
  if (!id.success) return { mensaje: "Orden inválida." };
  const db = await obtenerDb();
  const resultado = await registrarPago(db, id.data, user.id);
  if (!resultado.ok) return { mensaje: MENSAJES[resultado.error] };
  programarEntregaDeEventos();
  // La factura se emite al terminar la respuesta; si falla, la reintenta el proceso diario.
  const facturador = obtenerFacturador();
  const ordenId = id.data;
  if (facturador) {
    after(async () => {
      try {
        await facturarOrden(await obtenerDb(), facturador, ordenId);
      } catch (error) {
        console.error("[ordenes] no se pudo facturar ahora", error);
      }
    });
  }
  revalidatePath("/admin/ordenes", "layout");
  redirect(`/admin/ordenes/${id.data}?aviso=pago&activados=${resultado.valor.contratosActivados}`);
}

export async function cancelarOrdenAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const datos = z
    .object({
      ordenId: z.uuid(),
      motivo: z.string().trim().min(5, { error: "Contá brevemente por qué se cancela" }).max(300),
    })
    .safeParse({ ordenId: formData.get("ordenId"), motivo: formData.get("motivo") });
  if (!datos.success) {
    return { errores: { motivo: datos.error.issues.map((i) => i.message) } };
  }
  const db = await obtenerDb();
  const resultado = await cancelarOrden(db, datos.data.ordenId, user.id, datos.data.motivo);
  if (!resultado.ok) return { mensaje: MENSAJES[resultado.error] };
  programarEntregaDeEventos();
  revalidatePath("/admin/ordenes", "layout");
  redirect(`/admin/ordenes/${datos.data.ordenId}?aviso=cancelada`);
}

export async function reenviarLinkAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const id = z.uuid().safeParse(formData.get("ordenId"));
  if (!id.success) return { mensaje: "Orden inválida." };
  if (!(await reenvioPermitido(`link-pago:${id.data}`))) {
    return { mensaje: "Ya le reenviamos el mail varias veces en la última hora. Probá más tarde." };
  }
  const db = await obtenerDb();
  const resultado = await reenviarLinkDePago(db, obtenerPasarela(), id.data, user.id, urlBase);
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error === "SIN_PASARELA"
          ? "El link de pago no está configurado (faltan las credenciales de Mercado Pago)."
          : resultado.error === "MEDIO_SIN_LINK"
            ? "El medio de pago de esta orden no usa link."
            : "La orden ya no está pendiente de pago.",
    };
  }
  await enviarAlertasPendientes(db, enviarAlertaPorMail);
  revalidatePath(`/admin/ordenes/${id.data}`);
  return { ok: true, mensaje: `Link reenviado (${resultado.reenvios}.º envío).` };
}

export async function facturarAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requerirSofteam(["ADMINISTRACION"]);
  const id = z.uuid().safeParse(formData.get("ordenId"));
  if (!id.success) return { mensaje: "Orden inválida." };
  const facturador = obtenerFacturador();
  if (!facturador) return { mensaje: "La facturación electrónica no está configurada." };
  try {
    const r = await facturarOrden(await obtenerDb(), facturador, id.data);
    revalidatePath(`/admin/ordenes/${id.data}`);
    if (r.estado === "EMITIDA") return { ok: true, mensaje: `Comprobante ${r.numero} emitido.` };
    return {
      mensaje:
        r.estado === "EN_CURSO"
          ? "La emisión ya está en curso."
          : r.estado === "YA_FACTURADA"
            ? "La orden ya estaba facturada."
            : "Solo se facturan órdenes pagadas.",
    };
  } catch (e) {
    return { mensaje: `El facturador respondió con un error: ${(e as Error).message}` };
  }
}

export async function marcarRevisadaAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const id = z.uuid().safeParse(formData.get("ordenId"));
  if (!id.success) return;
  await marcarOrdenRevisada(await obtenerDb(), id.data, user.id);
  revalidatePath(`/admin/ordenes/${id.data}`);
}

const MENSAJES_BONIFICACION: Record<ErrorBonificacion, string> = {
  NO_EXISTE: "El paquete ya no existe.",
  ORDEN_NO_PENDIENTE: "Solo se bonifica una orden pendiente de pago.",
  CON_TICKET: "La orden tiene un código de descuento: la bonificación no se combina con él.",
  CALCULO: "No se pudo recalcular la orden.",
};

/** Bonifica un paquete de una orden pendiente (Administración o Comercial). */
export async function bonificarAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const valores = valoresDe(formData);
  const ordenId = z.uuid().safeParse(valores.ordenId);
  if (!ordenId.success) return { mensaje: "Orden inválida." };
  const datos = esquemaBonificacion.safeParse({
    contratoId: valores.contratoId,
    porcentaje: valores.porcentaje ?? "",
    recurrente: valores.recurrente === "on",
    motivo: valores.motivo ?? "",
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const resultado = await bonificarContrato(await obtenerDb(), datos.data, user.id);
  if (!resultado.ok) return { mensaje: MENSAJES_BONIFICACION[resultado.error], valores };
  revalidatePath(`/admin/ordenes/${ordenId.data}`);
  return { ok: true, mensaje: "Bonificación aplicada: la orden se recalculó." };
}
