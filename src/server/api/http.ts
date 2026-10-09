import "server-only";
import { timingSafeEqual } from "node:crypto";
import { claveMaestra, secretoCron } from "@/env";
import { obtenerDb } from "@/server/db";
import type { Db } from "@/server/db/cliente";
import { autenticarPeticion } from "@/server/modules/integraciones/autenticacion";

const TAMANO_MAXIMO_CUERPO = 64 * 1024;

/** Error en formato "problem details" (RFC 9457). */
export function problema(
  status: number,
  titulo: string,
  detalle?: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json(
    {
      type: "about:blank",
      title: titulo,
      status,
      ...(detalle ? { detail: detalle } : {}),
      ...extra,
    },
    {
      status,
      headers: { "content-type": "application/problem+json", "cache-control": "no-store" },
    },
  );
}

export function json(datos: unknown, status = 200): Response {
  return Response.json(datos, { status, headers: { "cache-control": "no-store" } });
}

export interface ContextoApi {
  db: Db;
  sistema: string;
  cuerpo: string;
}

/**
 * Envoltorio de los endpoints para productos: lee el cuerpo (con límite de
 * tamaño), verifica la firma HMAC del sistema y traduce errores inesperados a
 * un 500 sin filtrar detalles internos.
 */
export async function conApiFirmada(
  peticion: Request,
  manejar: (ctx: ContextoApi) => Promise<Response>,
): Promise<Response> {
  try {
    const largo = Number(peticion.headers.get("content-length") ?? 0);
    if (largo > TAMANO_MAXIMO_CUERPO) return problema(413, "Cuerpo demasiado grande");
    const cuerpo = await peticion.text();
    if (cuerpo.length > TAMANO_MAXIMO_CUERPO) return problema(413, "Cuerpo demasiado grande");

    const db = await obtenerDb();
    const autenticacion = await autenticarPeticion(db, peticion, cuerpo, claveMaestra);
    if (!autenticacion.ok) {
      console.warn(`[api] petición rechazada: ${autenticacion.error}`);
      return problema(401, "No autorizado", "Firma o sistema inválidos.");
    }
    const { uso } = autenticacion;
    const cabeceras = {
      "RateLimit-Limit": String(uso.limite),
      "RateLimit-Remaining": String(uso.restantes),
      "RateLimit-Reset": String(uso.reinicio),
    };
    if (!uso.permitido) {
      console.warn(
        `[api] ${autenticacion.sistema} superó su límite de ${uso.limite} pedidos por minuto`,
      );
      const respuesta = problema(
        429,
        "Demasiados pedidos",
        `El sistema superó su límite de ${uso.limite} pedidos por minuto. Reintentá en ${uso.reinicio} segundos.`,
      );
      for (const [k, v] of Object.entries({ ...cabeceras, "Retry-After": String(uso.reinicio) })) {
        respuesta.headers.set(k, v);
      }
      return respuesta;
    }
    const respuesta = await manejar({ db, sistema: autenticacion.sistema, cuerpo });
    for (const [k, v] of Object.entries(cabeceras)) respuesta.headers.set(k, v);
    return respuesta;
  } catch (error) {
    console.error("[api] error inesperado", error);
    return problema(500, "Error interno");
  }
}

/** Pedido del planificador (cron): `Authorization: Bearer <CRON_SECRET>`, comparado en tiempo constante. */
export function esPedidoDelCron(peticion: Request): boolean {
  const esperado = Buffer.from(`Bearer ${secretoCron}`);
  const recibido = Buffer.from(peticion.headers.get("authorization") ?? "");
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

/** Número de empresa de la ruta ("2001"). */
export function numeroEmpresa(texto: string): number | undefined {
  return /^\d{1,10}$/.test(texto) ? Number(texto) : undefined;
}
