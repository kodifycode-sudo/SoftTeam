import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { NUMERO_FACTURA_MANUAL } from "@/domain/facturacion/emisor";
import {
  esModoFacturacion,
  facturaAlConfirmar,
  type ModoFacturacion,
} from "@/domain/facturacion/modo";
import { fecha } from "@/domain/fecha";
import type { Facturador } from "@/server/cobros/facturador";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/** Fecha en la Argentina ("2026-09-29") de un instante. */
const fechaArgentina = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);

/** Una emisión reservada hace más que esto se considera caída y se reintenta. */
const RESERVA_CAIDA_MS = 10 * 60 * 1000;

export type ResultadoFactura =
  | { estado: "EMITIDA"; numero: string }
  | {
      estado: "YA_FACTURADA" | "NO_PAGADA" | "EN_CURSO" | "NO_EXISTE" | "SIN_IMPORTE" | "MANUAL";
    };

/**
 * Un facturador fijo, o el del emisor de cada orden (Mejora v2.1, 5.11).
 * `null`: el emisor no tiene Xubio y la factura se registra a mano.
 */
export type FuenteFacturador =
  | Facturador
  | ((emisorId: string | null) => Promise<Facturador | null>);

/**
 * Pagadas, o pendientes de los modos con factura adelantada (Mejora v2.1,
 * 7.6: modos 1 y 3, la factura se emite al confirmar y el pago llega después).
 */
const facturable = or(
  eq(t.ordenes.estado, "PAGADA"),
  and(eq(t.ordenes.estado, "PEND_PAGO"), inArray(t.ordenes.modoFacturacion, [1, 3])),
);

const modo = (valor: number): ModoFacturacion => (esModoFacturacion(valor) ? valor : 0);

/**
 * Emite el comprobante de una orden pagada (o con factura adelantada). La
 * reserva (una marca de tiempo con condición) evita que dos procesos la
 * facturen a la vez; la llamada al facturador queda fuera de toda transacción,
 * y el facturador es idempotente por orden, así que un reintento tras una
 * caída no duplica el comprobante.
 */
export async function facturarOrden(
  db: Db,
  fuente: FuenteFacturador,
  ordenId: string,
): Promise<ResultadoFactura> {
  let facturador: Facturador | null;
  if (typeof fuente === "function") {
    const orden = await db.query.ordenes.findFirst({
      columns: { emisorId: true, facturadaEn: true },
      where: eq(t.ordenes.id, ordenId),
    });
    if (!orden) return { estado: "NO_EXISTE" };
    if (orden.facturadaEn) return { estado: "YA_FACTURADA" };
    facturador = await fuente(orden.emisorId);
    if (!facturador) return { estado: "MANUAL" };
  } else {
    facturador = fuente;
  }
  const limite = new Date(Date.now() - RESERVA_CAIDA_MS);
  const [reservada] = await db
    .update(t.ordenes)
    .set({ facturacionIniciadaEn: new Date() })
    .where(
      and(
        eq(t.ordenes.id, ordenId),
        facturable,
        isNull(t.ordenes.facturadaEn),
        gt(t.ordenes.total, 0n),
        or(isNull(t.ordenes.facturacionIniciadaEn), lt(t.ordenes.facturacionIniciadaEn, limite)),
      ),
    )
    .returning();
  if (!reservada) {
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    if (!orden) return { estado: "NO_EXISTE" };
    if (orden.facturadaEn) return { estado: "YA_FACTURADA" };
    if (orden.total === 0n) return { estado: "SIN_IMPORTE" };
    if (
      orden.estado !== "PAGADA" &&
      !(orden.estado === "PEND_PAGO" && facturaAlConfirmar(modo(orden.modoFacturacion)))
    ) {
      return { estado: "NO_PAGADA" };
    }
    return { estado: "EN_CURSO" };
  }

  try {
    const [cliente, lineas] = await Promise.all([
      db.query.clientes.findFirst({ where: eq(t.clientes.id, reservada.clienteFacturacionId) }),
      db
        .select({
          descripcion: t.ordenItems.descripcion,
          importe: t.ordenItems.precioFinal,
          total: t.ordenItems.totalProrrateado,
        })
        .from(t.ordenItems)
        .where(eq(t.ordenItems.ordenId, ordenId))
        .orderBy(asc(t.ordenItems.descripcion)),
    ]);
    if (!cliente) throw new Error("Cliente de facturación inexistente");
    const comprobante = await facturador.emitir({
      ordenId,
      numeroOrden: reservada.numero,
      tipoComprobante: reservada.tipoComprobante,
      fecha: fechaArgentina(reservada.pagadaEn ?? new Date()),
      cliente: {
        cuit: cliente.cuit,
        nombre: cliente.nombreFactura,
        condicionIva: reservada.condicionIva,
        codigoArca: reservada.codigoArca,
        xubioId: cliente.xubioId,
        email: cliente.contactoAdministrador.email,
      },
      lineas,
      alicuotaIva: reservada.alicuotaIva,
      netoGravado: reservada.netoGravado,
      iva: reservada.iva,
      total: reservada.total,
      moneda: reservada.moneda,
      observacion: cliente.observacionFactura,
    });
    await db.transaction(async (tx) => {
      await tx
        .update(t.ordenes)
        .set({
          xubioComprobanteId: comprobante.comprobanteId,
          facturaNumero: comprobante.numero,
          facturadaEn: new Date(),
          facturacionIniciadaEn: null,
        })
        .where(eq(t.ordenes.id, ordenId));
      await auditar(tx, {
        actorId: null,
        actorTipo: `facturador:${facturador.nombre}`,
        entidad: "orden",
        empresaId: reservada.empresaId,
        entidadId: ordenId,
        accion: "facturar",
        despues: comprobante,
      });
    });
    return { estado: "EMITIDA", numero: comprobante.numero };
  } catch (e) {
    // Libera la reserva para reintentar en la próxima corrida.
    await db
      .update(t.ordenes)
      .set({ facturacionIniciadaEn: null })
      .where(eq(t.ordenes.id, ordenId));
    throw e;
  }
}

/** Factura las órdenes pagadas pendientes (proceso diario y reintentos). */
export async function facturarPendientes(
  db: Db,
  fuente: FuenteFacturador,
  limite = 100,
): Promise<{ emitidas: number; errores: number }> {
  const pendientes = await db
    .select({ id: t.ordenes.id })
    .from(t.ordenes)
    .leftJoin(t.emisores, eq(t.emisores.id, t.ordenes.emisorId))
    .where(
      and(
        facturable,
        isNull(t.ordenes.facturadaEn),
        gt(t.ordenes.total, 0n),
        // Las de un emisor sin Xubio se facturan a mano: no ocupan la corrida.
        or(isNull(t.ordenes.emisorId), eq(t.emisores.xubio, true)),
      ),
    )
    .orderBy(asc(sql`coalesce(${t.ordenes.pagadaEn}, ${t.ordenes.creadoEn})`))
    .limit(limite);
  let emitidas = 0;
  let errores = 0;
  for (const { id } of pendientes) {
    try {
      const r = await facturarOrden(db, fuente, id);
      if (r.estado === "EMITIDA") emitidas++;
    } catch (e) {
      errores++;
      console.error(`[facturación] no se pudo facturar la orden ${id}`, e);
    }
  }
  return { emitidas, errores };
}

export const esquemaFacturaManual = z.object({
  ordenId: z.uuid(),
  numero: z
    .string()
    .trim()
    .toUpperCase()
    .regex(NUMERO_FACTURA_MANUAL, { error: "Tipo, punto de venta y número: A-0001-00001234." }),
  fecha: z.iso.date({ error: "Elegí la fecha de la factura." }).transform(fecha),
});

export type ErrorFacturaManual = "NO_EXISTE" | "YA_FACTURADA" | "NO_FACTURABLE";

/**
 * Registra una factura emitida fuera del sistema, directamente en ARCA (emisor
 * sin Xubio, Mejora v2.1 5.11). Vale para las mismas órdenes que se facturan
 * solas: pagadas, o pendientes con factura adelantada.
 */
export async function registrarFacturaManual(
  db: Db,
  entrada: z.infer<typeof esquemaFacturaManual>,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorFacturaManual }> {
  return db.transaction(async (tx) => {
    const [orden] = await tx
      .select()
      .from(t.ordenes)
      .where(eq(t.ordenes.id, entrada.ordenId))
      .for("update");
    if (!orden) return { ok: false, error: "NO_EXISTE" };
    if (orden.facturadaEn) return { ok: false, error: "YA_FACTURADA" };
    const facturableAhora =
      orden.total > 0n &&
      (orden.estado === "PAGADA" ||
        (orden.estado === "PEND_PAGO" && facturaAlConfirmar(modo(orden.modoFacturacion))));
    if (!facturableAhora) return { ok: false, error: "NO_FACTURABLE" };
    await tx
      .update(t.ordenes)
      .set({
        facturaNumero: entrada.numero,
        // Mediodía en la Argentina: la fecha de calendario no se corre por la zona horaria.
        facturadaEn: new Date(`${entrada.fecha}T15:00:00Z`),
        facturacionIniciadaEn: null,
      })
      .where(eq(t.ordenes.id, orden.id));
    await auditar(tx, {
      actorId,
      entidad: "orden",
      empresaId: orden.empresaId ?? undefined,
      entidadId: orden.id,
      accion: "factura_manual",
      despues: { numero: entrada.numero, fecha: entrada.fecha },
    });
    return { ok: true };
  });
}

/**
 * Historial facturado de un cliente (Mejora v2.1, 5.11): sus órdenes con
 * factura, de todos los emisores que tuvo, con el emisor congelado en cada una.
 */
export function historialFacturado(db: Ejecutor, clienteId: string, limite = 50) {
  return db
    .select({
      id: t.ordenes.id,
      numero: t.ordenes.numero,
      facturadaEn: t.ordenes.facturadaEn,
      facturaNumero: t.ordenes.facturaNumero,
      tipoComprobante: t.ordenes.tipoComprobante,
      emisorRazonSocial: t.ordenes.emisorRazonSocial,
      emisorCuit: t.ordenes.emisorCuit,
      total: t.ordenes.total,
      moneda: t.ordenes.moneda,
      estado: t.ordenes.estado,
    })
    .from(t.ordenes)
    .where(and(eq(t.ordenes.clienteFacturacionId, clienteId), isNotNull(t.ordenes.facturadaEn)))
    .orderBy(desc(t.ordenes.facturadaEn))
    .limit(limite);
}
