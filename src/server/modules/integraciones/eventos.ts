import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { cabecerasFirmadas } from "@/server/seguridad/firma";
import { secretoDeSistema } from "./sistemas";

export const TIPO_EMPRESA_ACTUALIZADA = "empresa.actualizada";

/**
 * Registra que cambió una empresa (licencia, oficinas, usuarios…): actualiza
 * su fecha de modificación y encola un aviso para cada sistema con webhook.
 * Se llama dentro de la misma transacción que el cambio (patrón outbox): si
 * el cambio se confirma, el aviso existe; si no, tampoco.
 */
export async function registrarCambioEmpresa(
  tx: Ejecutor,
  empresaIds: readonly string[],
  ahora = new Date(),
) {
  const ids = [...new Set(empresaIds)];
  if (ids.length === 0) return;
  const empresas = await tx
    .update(t.empresas)
    .set({ modificadaEn: ahora })
    .where(inArray(t.empresas.id, ids))
    .returning({ numero: t.empresas.numero });
  const destinos = await tx
    .select({ sistema: t.apiClientes.sistema })
    .from(t.apiClientes)
    .where(and(eq(t.apiClientes.activo, true), isNotNull(t.apiClientes.webhookUrl)));
  if (destinos.length === 0 || empresas.length === 0) return;
  await tx.insert(t.eventosSalida).values(
    destinos.flatMap((d) =>
      empresas.map((e) => ({
        tipo: TIPO_EMPRESA_ACTUALIZADA,
        destino: d.sistema,
        payload: {
          tipo: TIPO_EMPRESA_ACTUALIZADA,
          empresa: e.numero,
          modificadaEn: ahora.toISOString(),
        },
      })),
    ),
  );
}

/** Espera antes de cada reintento: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h. */
const ESPERAS_MINUTOS = [1, 5, 30, 120, 360, 720, 1440];
export const MAXIMO_INTENTOS = ESPERAS_MINUTOS.length + 1;

export type Enviar = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status">>;

export interface ResumenEntrega {
  entregados: number;
  reintentos: number;
  fallidos: number;
}

/** Reserva de un lote mientras se envía: otra ejecución no lo toma en ese lapso. */
const RESERVA_MS = 2 * 60_000;
/** Tiempo máximo de una ejecución: después, lo que falte queda para la siguiente. */
const PRESUPUESTO_MS = 25_000;

type Evento = typeof t.eventosSalida.$inferSelect;

/**
 * Reserva un lote de avisos vencidos en una transacción corta: los bloquea
 * con `FOR UPDATE SKIP LOCKED` y corre su próximo intento unos minutos. Así
 * los envíos (HTTP, lentos) ocurren fuera de toda transacción y dos
 * ejecuciones simultáneas nunca toman el mismo aviso.
 */
async function reservarLote(db: Db, ahora: Date, limite: number): Promise<Evento[]> {
  return db.transaction(async (tx) => {
    const eventos = await tx
      .select()
      .from(t.eventosSalida)
      .where(
        and(eq(t.eventosSalida.estado, "PENDIENTE"), lte(t.eventosSalida.proximoIntentoEn, ahora)),
      )
      .orderBy(asc(t.eventosSalida.id))
      .limit(limite)
      .for("update", { skipLocked: true });
    if (eventos.length) {
      await tx
        .update(t.eventosSalida)
        .set({ proximoIntentoEn: new Date(ahora.getTime() + RESERVA_MS) })
        .where(
          inArray(
            t.eventosSalida.id,
            eventos.map((e) => e.id),
          ),
        );
    }
    return eventos;
  });
}

type Destino = Awaited<ReturnType<typeof secretoDeSistema>>;

/** Envía un aviso firmado. Devuelve el error, o null si el webhook respondió 2xx. */
async function enviarAviso(
  evento: Evento,
  destino: Destino,
  enviar: Enviar,
): Promise<string | null> {
  if (!destino?.webhookUrl) return "El sistema no está activo o no tiene webhook";
  const cuerpo = JSON.stringify({ id: evento.id, ...(evento.payload as object) });
  const url = new URL(destino.webhookUrl);
  try {
    const respuesta = await enviar(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...cabecerasFirmadas(evento.destino, destino.secreto, {
          metodo: "POST",
          ruta: url.pathname + url.search,
          cuerpo,
        }),
      },
      body: cuerpo,
      signal: AbortSignal.timeout(10_000),
    });
    return respuesta.ok ? null : `El webhook respondió ${respuesta.status}`;
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 450) : "Error de red";
  }
}

/**
 * Entrega los avisos pendientes a los webhooks, firmados con el secreto de
 * cada sistema. Procesa lotes hasta vaciar lo vencido o agotar el
 * presupuesto de tiempo; dentro de un lote envía en paralelo, así un sistema
 * caído no demora a los demás. Ante un error reintenta con espera creciente;
 * tras el último intento, el aviso queda FALLIDO.
 */
export async function entregarEventos(
  db: Db,
  opciones: { claveMaestra: string; enviar?: Enviar; ahora?: Date; limite?: number },
): Promise<ResumenEntrega> {
  const enviar: Enviar = opciones.enviar ?? ((url, init) => fetch(url, init));
  const ahora = opciones.ahora ?? new Date();
  const inicio = Date.now();
  const resumen: ResumenEntrega = { entregados: 0, reintentos: 0, fallidos: 0 };
  const destinos = new Map<string, Destino>();

  while (Date.now() - inicio < PRESUPUESTO_MS) {
    const lote = await reservarLote(db, ahora, opciones.limite ?? 25);
    if (lote.length === 0) break;

    for (const sistema of new Set(lote.map((e) => e.destino))) {
      if (!destinos.has(sistema))
        destinos.set(sistema, await secretoDeSistema(db, sistema, opciones.claveMaestra));
    }
    const errores = await Promise.all(
      lote.map((e) => enviarAviso(e, destinos.get(e.destino), enviar)),
    );

    for (const [i, evento] of lote.entries()) {
      const error = errores[i] ?? null;
      const intentos = evento.intentos + 1;
      if (error === null) {
        await db
          .update(t.eventosSalida)
          .set({ estado: "ENTREGADO", entregadoEn: ahora, intentos, ultimoError: null })
          .where(eq(t.eventosSalida.id, evento.id));
        resumen.entregados++;
        continue;
      }
      const agotado = intentos >= MAXIMO_INTENTOS;
      const espera = ESPERAS_MINUTOS[Math.min(intentos - 1, ESPERAS_MINUTOS.length - 1)] as number;
      await db
        .update(t.eventosSalida)
        .set({
          estado: agotado ? "FALLIDO" : "PENDIENTE",
          intentos,
          ultimoError: error,
          proximoIntentoEn: new Date(ahora.getTime() + espera * 60_000),
        })
        .where(eq(t.eventosSalida.id, evento.id));
      if (agotado) resumen.fallidos++;
      else resumen.reintentos++;
    }
  }
  return resumen;
}

/** Vuelve a poner en cola un evento fallido (acción manual desde el panel). */
export async function reintentarEvento(db: Db, id: number) {
  await db
    .update(t.eventosSalida)
    .set({ estado: "PENDIENTE", proximoIntentoEn: new Date(), intentos: sql`0` })
    .where(and(eq(t.eventosSalida.id, id), eq(t.eventosSalida.estado, "FALLIDO")));
}

export function listarEventosRecientes(db: Ejecutor, limite = 50) {
  return db.select().from(t.eventosSalida).orderBy(desc(t.eventosSalida.id)).limit(limite);
}
