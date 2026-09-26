import { createHmac, timingSafeEqual } from "node:crypto";
import { exito, rechazo } from "@/domain/resultado";
import type { EstadoPago, Pasarela } from "./pasarela";

const API = "https://api.mercadopago.com";

/** Estados de pago de Mercado Pago → los nuestros. */
function estadoDe(status: string): EstadoPago {
  if (status === "approved") return "APROBADO";
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(status)) return "RECHAZADO";
  return "PENDIENTE";
}

/**
 * Valida la firma de una notificación (cabecera `x-signature`:
 * "ts=…,v1=…"). La firma es un HMAC-SHA256 con la clave secreta de las
 * notificaciones sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 */
export function firmaDeNotificacionValida(
  secreto: string,
  datos: { dataId: string | null; requestId: string | null; cabecera: string | null },
): boolean {
  if (!datos.cabecera) return false;
  const partes = Object.fromEntries(
    datos.cabecera.split(",").map((p) => {
      const [clave, ...valor] = p.trim().split("=");
      return [clave, valor.join("=")];
    }),
  ) as { ts?: string; v1?: string };
  if (!partes.ts || !partes.v1) return false;
  const id =
    datos.dataId && /^[a-z0-9]+$/i.test(datos.dataId) ? datos.dataId.toLowerCase() : datos.dataId;
  const manifiesto = [
    id ? `id:${id};` : "",
    datos.requestId ? `request-id:${datos.requestId};` : "",
    `ts:${partes.ts};`,
  ].join("");
  const esperado = Buffer.from(createHmac("sha256", secreto).update(manifiesto).digest("hex"));
  const recibido = Buffer.from(partes.v1);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

/**
 * Adaptador de Mercado Pago (Checkout Pro). Se activa con
 * MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET.
 */
export function crearMercadoPago(
  config: { token: string; secretoAvisos: string },
  fetchApi: typeof fetch = fetch,
): Pasarela {
  const pedir = async (ruta: string, init: RequestInit = {}) => {
    const respuesta = await fetchApi(`${API}${ruta}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!respuesta.ok) {
      throw new Error(`Mercado Pago respondió ${respuesta.status}: ${await respuesta.text()}`);
    }
    return respuesta.json() as Promise<Record<string, unknown>>;
  };

  return {
    nombre: "mercadopago",

    async crearLink(s) {
      const preferencia = await pedir("/checkout/preferences", {
        method: "POST",
        // Un reintento no crea dos preferencias para la misma orden.
        headers: { "X-Idempotency-Key": `stlic-${s.ordenId}` },
        body: JSON.stringify({
          items: [
            {
              id: s.ordenId,
              title: s.descripcion,
              quantity: 1,
              currency_id: s.moneda,
              unit_price: Number(s.total) / 100,
            },
          ],
          external_reference: s.ordenId,
          notification_url: s.urlAviso,
          back_urls: { success: s.urlRetorno, failure: s.urlRetorno, pending: s.urlRetorno },
          auto_return: "approved",
          statement_descriptor: "SOFTEAM",
        }),
      });
      const id = preferencia.id;
      const url = preferencia.init_point;
      if (typeof id !== "string" || typeof url !== "string") {
        throw new Error("Mercado Pago no devolvió el link de pago");
      }
      return { preferenciaId: id, url };
    },

    async obtenerPago(pagoId) {
      if (!/^\d{1,30}$/.test(pagoId)) return undefined;
      const pago = await pedir(`/v1/payments/${pagoId}`);
      const referencia = pago.external_reference;
      if (typeof referencia !== "string") return undefined;
      return {
        id: String(pago.id),
        ordenId: referencia,
        estado: estadoDe(String(pago.status)),
        monto: BigInt(Math.round(Number(pago.transaction_amount) * 100)),
        moneda: String(pago.currency_id),
        detalle: typeof pago.status_detail === "string" ? pago.status_detail : undefined,
      };
    },

    leerAviso({ url, headers, cuerpo }) {
      const parametros = new URL(url).searchParams;
      let dataId = parametros.get("data.id");
      let tipo = parametros.get("type") ?? parametros.get("topic");
      try {
        const aviso = JSON.parse(cuerpo || "{}") as { type?: string; data?: { id?: unknown } };
        dataId ??= aviso.data?.id !== undefined ? String(aviso.data.id) : null;
        tipo ??= aviso.type ?? null;
      } catch {
        // Cuerpo vacío o no JSON: alcanza con los parámetros de la URL.
      }
      const valida = firmaDeNotificacionValida(config.secretoAvisos, {
        dataId,
        requestId: headers.get("x-request-id"),
        cabecera: headers.get("x-signature"),
      });
      if (!valida) return rechazo("FIRMA_INVALIDA");
      if (tipo !== "payment" || !dataId) return exito(null);
      return exito({ pagoId: dataId });
    },
  };
}
