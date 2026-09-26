import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import type { Facturador } from "@/server/cobros/facturador";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/** Una emisión reservada hace más que esto se considera caída y se reintenta. */
const RESERVA_CAIDA_MS = 10 * 60 * 1000;

export type ResultadoFactura =
  | { estado: "EMITIDA"; numero: string }
  | { estado: "YA_FACTURADA" | "NO_PAGADA" | "EN_CURSO" | "NO_EXISTE" };

/**
 * Emite el comprobante de una orden pagada. La reserva (una marca de tiempo
 * con condición) evita que dos procesos la facturen a la vez; la llamada al
 * facturador queda fuera de toda transacción, y el facturador es idempotente
 * por orden, así que un reintento tras una caída no duplica el comprobante.
 */
export async function facturarOrden(
  db: Db,
  facturador: Facturador,
  ordenId: string,
): Promise<ResultadoFactura> {
  const limite = new Date(Date.now() - RESERVA_CAIDA_MS);
  const [reservada] = await db
    .update(t.ordenes)
    .set({ facturacionIniciadaEn: new Date() })
    .where(
      and(
        eq(t.ordenes.id, ordenId),
        eq(t.ordenes.estado, "PAGADA"),
        isNull(t.ordenes.facturadaEn),
        or(isNull(t.ordenes.facturacionIniciadaEn), lt(t.ordenes.facturacionIniciadaEn, limite)),
      ),
    )
    .returning();
  if (!reservada) {
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    if (!orden) return { estado: "NO_EXISTE" };
    if (orden.facturadaEn) return { estado: "YA_FACTURADA" };
    if (orden.estado !== "PAGADA") return { estado: "NO_PAGADA" };
    return { estado: "EN_CURSO" };
  }

  try {
    const [cliente, lineas] = await Promise.all([
      db.query.clientes.findFirst({ where: eq(t.clientes.id, reservada.clienteFacturacionId) }),
      db
        .select({ descripcion: t.ordenItems.descripcion, importe: t.ordenItems.precioFinal })
        .from(t.ordenItems)
        .where(eq(t.ordenItems.ordenId, ordenId))
        .orderBy(asc(t.ordenItems.descripcion)),
    ]);
    if (!cliente) throw new Error("Cliente de facturación inexistente");
    const comprobante = await facturador.emitir({
      ordenId,
      numeroOrden: reservada.numero,
      tipoComprobante: reservada.tipoComprobante,
      cliente: {
        cuit: cliente.cuit,
        nombre: cliente.nombreFactura,
        condicionIva: cliente.condicionIva,
      },
      lineas,
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
  facturador: Facturador,
  limite = 100,
): Promise<{ emitidas: number; errores: number }> {
  const pendientes = await db
    .select({ id: t.ordenes.id })
    .from(t.ordenes)
    .where(and(eq(t.ordenes.estado, "PAGADA"), isNull(t.ordenes.facturadaEn)))
    .orderBy(asc(t.ordenes.pagadaEn))
    .limit(limite);
  let emitidas = 0;
  let errores = 0;
  for (const { id } of pendientes) {
    try {
      const r = await facturarOrden(db, facturador, id);
      if (r.estado === "EMITIDA") emitidas++;
    } catch (e) {
      errores++;
      console.error(`[facturación] no se pudo facturar la orden ${id}`, e);
    }
  }
  return { emitidas, errores };
}
