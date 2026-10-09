import "server-only";
import { createHmac } from "node:crypto";
import { claveMaestra, env, esProduccion } from "@/env";
import type { Ejecutor } from "@/server/db/cliente";
import { credencialesEmisor } from "@/server/modules/catalogo/emisores";
import { crearFacturadorSimulado, type Facturador } from "./facturador";
import { crearMercadoPago } from "./mercadopago";
import type { Pasarela } from "./pasarela";
import { crearSimulador } from "./simulador";
import { crearXubio } from "./xubio";

/** Secreto del simulador, derivado de la clave maestra (nunca se usa en producción). */
export const secretoSimulador = createHmac("sha256", Buffer.from(claveMaestra, "base64"))
  .update("simulador-de-pagos")
  .digest("base64url");

export const urlBase = env.BETTER_AUTH_URL.replace(/\/$/, "");

/**
 * Pasarela activa: Mercado Pago si hay credenciales; si no, el simulador
 * (solo fuera de producción). `null`: el link de pago no está disponible.
 */
export function obtenerPasarela(): Pasarela | null {
  if (env.MERCADOPAGO_ACCESS_TOKEN && env.MERCADOPAGO_WEBHOOK_SECRET) {
    return crearMercadoPago({
      token: env.MERCADOPAGO_ACCESS_TOKEN,
      secretoAvisos: env.MERCADOPAGO_WEBHOOK_SECRET,
    });
  }
  return esProduccion ? null : crearSimulador(secretoSimulador, urlBase);
}

export const simuladorDePagosActivo = () => obtenerPasarela()?.nombre === "simulador";

/**
 * Facturador activo: Xubio si está configurado; si no, fuera de producción
 * el simulador, y en producción ninguno (las órdenes pagadas quedan
 * "pendientes de facturar" hasta configurarlo).
 */
export function obtenerFacturador(): Facturador | null {
  if (
    env.XUBIO_CLIENT_ID &&
    env.XUBIO_SECRET_ID &&
    env.XUBIO_PUNTO_VENTA_ID &&
    env.XUBIO_PRODUCTO_ID
  ) {
    return crearXubio({
      clientId: env.XUBIO_CLIENT_ID,
      secretId: env.XUBIO_SECRET_ID,
      puntoVentaId: env.XUBIO_PUNTO_VENTA_ID,
      productoId: env.XUBIO_PRODUCTO_ID,
      centroDeCostoId: env.XUBIO_CENTRO_COSTO_ID,
    });
  }
  return esProduccion ? null : crearFacturadorSimulado();
}

/**
 * Pasarela del emisor de una orden: su cuenta de Mercado
 * Pago o, si no cargó credenciales propias, la del entorno. Sin conexión con
 * Mercado Pago no hay link de pago. Sin emisor (órdenes viejas), la del entorno.
 */
export async function pasarelaDeEmisor(
  db: Ejecutor,
  emisorId: string | null,
): Promise<Pasarela | null> {
  if (!emisorId) return obtenerPasarela();
  const credenciales = await credencialesEmisor(db, emisorId, claveMaestra);
  const mp = credenciales?.mercadoPago;
  if (!mp) return null;
  if (mp.token && mp.secretoAvisos) {
    return crearMercadoPago({ token: mp.token, secretoAvisos: mp.secretoAvisos });
  }
  return obtenerPasarela();
}

/**
 * Facturador del emisor de una orden: su cuenta de Xubio o, si no cargó
 * credenciales propias, la del entorno. Sin conexión con Xubio, `null`: la
 * factura se emite fuera del sistema y Administración la registra a mano.
 */
export async function facturadorDeEmisor(
  db: Ejecutor,
  emisorId: string | null,
): Promise<Facturador | null> {
  if (!emisorId) return obtenerFacturador();
  const credenciales = await credencialesEmisor(db, emisorId, claveMaestra);
  const xubio = credenciales?.xubio;
  if (!xubio) return null;
  const productoId = xubio.productoId ?? env.XUBIO_PRODUCTO_ID;
  if (xubio.clientId && xubio.secretId && xubio.puntoVentaId && productoId) {
    return crearXubio({
      clientId: xubio.clientId,
      secretId: xubio.secretId,
      puntoVentaId: xubio.puntoVentaId,
      productoId,
      centroDeCostoId: xubio.centroDeCostoId ?? env.XUBIO_CENTRO_COSTO_ID,
    });
  }
  return obtenerFacturador();
}
