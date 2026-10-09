"use server";

import { revalidatePath } from "next/cache";
import type { ImportesDesglose } from "@/components/compra/desglose";
import { fechaCorta } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";
import {
  confirmarOrdenManual,
  cotizarOrdenManual,
  esquemaOrdenManual,
  type RechazoOrdenManual,
} from "@/server/modules/ventas/orden-manual";

/** Lo que la pantalla manda: los porcentajes y cantidades llegan como texto. */
export interface PedidoOrdenManual {
  empresaId: string;
  items: {
    alternativaId: string;
    cantidad: string;
    contratoAnteriorId?: string;
    bonificacion: string;
    recurrente: boolean;
    motivo: string;
    cantidadSaldo: string;
  }[];
  medioPagoId: string;
  ticketCodigo: string;
  diaVenc: string;
  fechaDesde: string;
  emisorId: string;
}

export interface CotizacionManual {
  lineas: { descripcion: string; precioFinal: bigint }[];
  importes: ImportesDesglose;
  codigoTicket: string | null;
  medio: string;
  comprobante: string;
  facturaA: string;
  emisor: string;
  /** Explicación de cómo nace: trimestre, adicional o alta a grupo. */
  situacion: string;
  diasVenc: number[];
  diaVenc: number | null;
}

const MENSAJES: Partial<Record<RechazoOrdenManual, string>> = {
  SIN_ITEMS: "Agregá al menos un paquete.",
  ITEM_INVALIDO: "Alguno de los paquetes ya no existe.",
  ITEM_NO_DISPONIBLE: "no está a la venta hoy para el país de la empresa.",
  SALDO_SOLO_BONIFICADO: "solo se edita el saldo de un consumible bonificado al 100 %.",
  RENOVACION_INVALIDA: "el contrato a renovar no corresponde a ese paquete.",
  YA_RENOVADO: "ya tiene su renovación generada.",
  PLAN_NO_PERMITIDO:
    "el primer alta de un cliente directo es trimestral; después, mensual o anual.",
  DIA_INVALIDO: "Ese día de vencimiento no está habilitado.",
  MEDIO_NO_HABILITADO:
    "El medio de pago no está habilitado para el país, el modo de facturación o el emisor.",
  SIN_EMISOR: "No hay un emisor activo para facturar.",
  IVA_COND_INVALIDA: "La condición frente al IVA del cliente no permite facturarle.",
  COMP_NO_HABILITADO: "La condición frente al IVA del cliente no tiene comprobante habilitado.",
  TICKET_INVALIDO: "El ticket no existe o está inactivo.",
  TICKET_VENCIDO: "El ticket está fuera de su vigencia.",
  TICKET_CORPORATIVO: "Los tickets no aplican a la factura agrupada.",
  TICKET_SOBRE_BONIFICADO: "Un ticket no aplica si algún paquete está bonificado.",
  TICKET_OTRA_MONEDA: "El ticket es de otra moneda.",
  TICKET_OTRO_PAIS: "El ticket es de otro país.",
  TICKET_OTRO_CLIENTE: "El ticket está nominado a otro cliente.",
  TICKET_PAQUETE_NO_HABILITADO: "El ticket está restringido a otros paquetes.",
  TICKET_INSTANCIA_NO_HABILITADA: "El ticket no se puede usar en este tipo de compra.",
  TICKET_MINIMO: "El subtotal no llega al mínimo del ticket.",
  TICKET_SIN_USOS: "El ticket ya no tiene usos disponibles.",
  TICKET_AGOTADO: "El ticket agotó su tope.",
};

function mensaje(error: RechazoOrdenManual, detalle?: string): string {
  const texto = MENSAJES[error] ?? `No se pudo preparar la orden (${error}).`;
  return detalle && /^[a-z]/.test(texto) ? `${detalle}: ${texto}` : texto;
}

const SITUACION = {
  TRIMESTRE_INICIAL: "Primer alta: trimestre completo, sin día de vencimiento.",
  ADICIONAL: "Adicional o renovación: se alinea al día de vencimiento.",
  GRUPO: "Alta a grupo: sin orden ahora; la incorpora la próxima orden colectiva.",
} as const;

function leer(pedido: PedidoOrdenManual) {
  return esquemaOrdenManual.safeParse({
    empresaId: pedido.empresaId,
    items: pedido.items.map((i) => ({
      alternativaId: i.alternativaId,
      cantidad: i.cantidad,
      contratoAnteriorId: i.contratoAnteriorId || undefined,
      bonificacion: i.bonificacion.trim() || "0",
      recurrente: i.recurrente,
      motivo: i.motivo.trim() || undefined,
      cantidadSaldo: i.cantidadSaldo.trim() || undefined,
    })),
    medioPagoId: pedido.medioPagoId || undefined,
    ticketCodigo: pedido.ticketCodigo.trim() || undefined,
    diaVenc: pedido.diaVenc || undefined,
    fechaDesde: pedido.fechaDesde || undefined,
    emisorId: pedido.emisorId || undefined,
  });
}

/** Cotiza sin grabar: la pantalla muestra el desglose antes de confirmar. */
export async function cotizarOrdenManualAccion(
  pedido: PedidoOrdenManual,
): Promise<{ ok: true; cotizacion: CotizacionManual } | { ok: false; mensaje: string }> {
  await requerirSofteam(["ADMINISTRACION"]);
  const datos = leer(pedido);
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Revisá los datos." };
  }
  const r = await cotizarOrdenManual(await obtenerDb(), datos.data);
  if (!r.ok) return { ok: false, mensaje: mensaje(r.error, r.detalle) };
  const c = r.valor;
  return {
    ok: true,
    cotizacion: {
      lineas: c.lineas.map((l) => ({
        descripcion: l.periodo?.hasta
          ? `${l.descripcion} · vence el ${fechaCorta(l.periodo.hasta)}`
          : l.descripcion,
        precioFinal: l.calculo.precioFinal,
      })),
      importes: c.calculo,
      codigoTicket: c.ticket?.codigo ?? null,
      medio: c.medio.nombre,
      comprobante: c.tipoComprobante,
      facturaA: c.clienteFacturacion.nombre,
      emisor: c.emisor.razonSocial,
      situacion: SITUACION[c.situacion],
      diasVenc: c.diasVenc,
      diaVenc: c.diaVenc,
    },
  };
}

export async function confirmarOrdenManualAccion(
  pedido: PedidoOrdenManual & { claveIdempotencia: string; clienteId: string },
): Promise<{ ok: true; ordenId: string | null; mensaje: string } | { ok: false; mensaje: string }> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const datos = leer(pedido);
  if (!datos.success) {
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Revisá los datos." };
  }
  const r = await confirmarOrdenManual(await obtenerDb(), {
    ...datos.data,
    usuarioId: user.id,
    claveIdempotencia: pedido.claveIdempotencia,
  });
  if (!r.ok) return { ok: false, mensaje: mensaje(r.error, r.detalle) };
  programarEntregaDeEventos();
  revalidatePath(`/admin/clientes/${pedido.clienteId}`);
  revalidatePath("/admin");
  return r.valor.ordenId
    ? { ok: true, ordenId: r.valor.ordenId, mensaje: `Orden #${r.valor.numero} generada.` }
    : {
        ok: true,
        ordenId: null,
        mensaje: `${r.valor.contratos} paquete(s) cargados: se cobran en la próxima orden del grupo.`,
      };
}
