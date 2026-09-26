import { createHmac, timingSafeEqual } from "node:crypto";
import type { Centavos } from "@/domain/dinero";
import { exito, rechazo } from "@/domain/resultado";
import type { EstadoPago, Pago, Pasarela } from "./pasarela";

/*
 * Simulador de pasarela para desarrollo y pruebas. No guarda estado: el id de
 * cada pago lleva sus datos y una firma, así nadie puede fabricar un pago
 * aprobado. Los avisos viajan firmados, como los de la pasarela real.
 */

export const CABECERA_FIRMA_SIMULADOR = "x-simulador-firma";

const b64 = (texto: string) => Buffer.from(texto).toString("base64url");
const deB64 = (texto: string) => Buffer.from(texto, "base64url").toString();

function firmar(secreto: string, texto: string) {
  return createHmac("sha256", secreto).update(texto).digest("base64url");
}

function coincide(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

interface DatosPago {
  o: string;
  e: EstadoPago;
  m: string;
  t: string;
  d?: string;
  /** Hace único cada intento de pago. */
  n: number;
}

/** Arma el id firmado de un pago simulado (lo usa la pantalla del simulador). */
export function crearPagoSimulado(
  secreto: string,
  pago: { ordenId: string; estado: EstadoPago; monto: Centavos; moneda: string; detalle?: string },
): string {
  const datos: DatosPago = {
    o: pago.ordenId,
    e: pago.estado,
    m: pago.moneda,
    t: pago.monto.toString(),
    n: Date.now(),
    ...(pago.detalle ? { d: pago.detalle } : {}),
  };
  const cuerpo = b64(JSON.stringify(datos));
  return `sim_${cuerpo}.${firmar(secreto, cuerpo)}`;
}

/** Cuerpo y firma del aviso que el simulador envía al webhook. */
export function avisoSimulado(secreto: string, pagoId: string) {
  const cuerpo = JSON.stringify({ type: "payment", data: { id: pagoId } });
  return { cuerpo, firma: firmar(secreto, cuerpo) };
}

export function crearSimulador(secreto: string, urlBase: string): Pasarela {
  return {
    nombre: "simulador",

    async crearLink(s) {
      return {
        preferenciaId: `sim-${s.ordenId}`,
        url: `${urlBase.replace(/\/$/, "")}/simulador/pago/${s.ordenId}`,
      };
    },

    async obtenerPago(pagoId) {
      const [prefijado, firma] = pagoId.split(".");
      if (!prefijado?.startsWith("sim_") || !firma) return undefined;
      const cuerpo = prefijado.slice(4);
      if (!coincide(firma, firmar(secreto, cuerpo))) return undefined;
      const d = JSON.parse(deB64(cuerpo)) as DatosPago;
      return {
        id: pagoId,
        ordenId: d.o,
        estado: d.e,
        monto: BigInt(d.t),
        moneda: d.m,
        detalle: d.d,
      } satisfies Pago;
    },

    leerAviso({ headers, cuerpo }) {
      const firma = headers.get(CABECERA_FIRMA_SIMULADOR) ?? "";
      if (!coincide(firma, firmar(secreto, cuerpo))) return rechazo("FIRMA_INVALIDA");
      const aviso = JSON.parse(cuerpo) as { type?: string; data?: { id?: string } };
      if (aviso.type !== "payment" || !aviso.data?.id) return exito(null);
      return exito({ pagoId: aviso.data.id });
    },
  };
}
