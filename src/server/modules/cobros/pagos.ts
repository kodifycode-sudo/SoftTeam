import { and, eq, isNull, sql } from "drizzle-orm";
import { type Centavos, formatearMoneda } from "@/domain/dinero";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import type { Pago, Pasarela } from "@/server/cobros/pasarela";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { registrarAlerta } from "../procesos/alertas";
import { type AlcanceOrden, alcanceDeOrden, registrarPago } from "../ventas/ordenes";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ErrorLink = "NO_EXISTE" | "NO_PENDIENTE" | "MEDIO_SIN_LINK" | "SIN_PASARELA";

/** Una pasarela fija, o la del emisor de cada orden. */
export type FuentePasarela =
  | Pasarela
  | null
  | ((emisorId: string | null) => Promise<Pasarela | null>);

/**
 * Link de pago de una orden pendiente. Se crea una vez y se reutiliza: los
 * importes de la orden están congelados, así que el link sigue siendo válido
 * hasta que se paga.
 */
export async function obtenerLinkDePago(
  db: Ejecutor,
  fuente: FuentePasarela,
  ordenId: string,
  opciones: { urlBase: string; alcance?: AlcanceOrden },
): Promise<{ ok: true; url: string } | { ok: false; error: ErrorLink }> {
  if (!ES_UUID.test(ordenId)) return { ok: false, error: "NO_EXISTE" };
  const [fila] = await db
    .select({
      id: t.ordenes.id,
      numero: t.ordenes.numero,
      estado: t.ordenes.estado,
      total: t.ordenes.total,
      moneda: t.ordenes.moneda,
      linkPagoUrl: t.ordenes.linkPagoUrl,
      emisorId: t.ordenes.emisorId,
      generaLink: t.mediosPago.generaLink,
    })
    .from(t.ordenes)
    .innerJoin(t.mediosPago, eq(t.mediosPago.id, t.ordenes.medioPagoId))
    .where(and(eq(t.ordenes.id, ordenId), alcanceDeOrden(opciones.alcance ?? {})));
  if (!fila) return { ok: false, error: "NO_EXISTE" };
  if (fila.estado !== "PEND_PAGO") return { ok: false, error: "NO_PENDIENTE" };
  if (!fila.generaLink) return { ok: false, error: "MEDIO_SIN_LINK" };
  if (fila.linkPagoUrl) return { ok: true, url: fila.linkPagoUrl };
  const pasarela = typeof fuente === "function" ? await fuente(fila.emisorId) : fuente;
  if (!pasarela) return { ok: false, error: "SIN_PASARELA" };

  const link = await pasarela.crearLink({
    ordenId: fila.id,
    numero: fila.numero,
    descripcion: `SOFTeam · Orden #${fila.numero}`,
    total: fila.total,
    moneda: fila.moneda,
    urlRetorno: `${opciones.urlBase}/portal/ordenes/${fila.id}`,
    // El aviso indica el emisor: su notificación se valida con su clave.
    urlAviso: `${opciones.urlBase}/api/pagos/aviso${fila.emisorId ? `?emisor=${fila.emisorId}` : ""}`,
  });
  // Si dos pedidos crearon el link a la vez, queda el primero.
  const [guardada] = await db
    .update(t.ordenes)
    .set({ mpPreferenciaId: link.preferenciaId, linkPagoUrl: link.url })
    .where(and(eq(t.ordenes.id, fila.id), isNull(t.ordenes.linkPagoUrl)))
    .returning({ url: t.ordenes.linkPagoUrl });
  if (guardada?.url) return { ok: true, url: guardada.url };
  const actual = await db.query.ordenes.findFirst({
    columns: { linkPagoUrl: true },
    where: eq(t.ordenes.id, fila.id),
  });
  return { ok: true, url: actual?.linkPagoUrl ?? link.url };
}

/**
 * Reenvía el link de pago al cliente (queda como aviso y se manda por mail).
 * Cuenta los reenvíos, para que SOFTeam vea la insistencia.
 */
export async function reenviarLinkDePago(
  db: Db,
  pasarela: FuentePasarela,
  ordenId: string,
  actorId: string,
  urlBase: string,
): Promise<{ ok: true; reenvios: number } | { ok: false; error: ErrorLink }> {
  const link = await obtenerLinkDePago(db, pasarela, ordenId, { urlBase });
  if (!link.ok) return link;
  return db.transaction(async (tx) => {
    const [orden] = await tx
      .update(t.ordenes)
      .set({ linkReenvios: sql`${t.ordenes.linkReenvios} + 1` })
      .where(eq(t.ordenes.id, ordenId))
      .returning({
        numero: t.ordenes.numero,
        empresaId: t.ordenes.empresaId,
        total: t.ordenes.total,
        reenvios: t.ordenes.linkReenvios,
      });
    if (!orden) return { ok: false as const, error: "NO_EXISTE" as const };
    await registrarAlerta(tx, {
      tipo: "LINK_PAGO_REENVIADO",
      clave: `LINK_PAGO_REENVIADO:${ordenId}:${orden.reenvios}`,
      mensaje: `Te reenviamos el link para pagar la orden #${orden.numero} por ${formatearMoneda(orden.total as Centavos)}: ${link.url}`,
      empresaId: orden.empresaId,
      ordenId,
      paraSofteam: false,
    });
    await auditar(tx, {
      actorId,
      entidad: "orden",
      empresaId: orden.empresaId,
      entidadId: ordenId,
      accion: "reenviar_link",
      despues: { reenvios: orden.reenvios },
    });
    return { ok: true as const, reenvios: orden.reenvios };
  });
}

export type ResultadoAviso =
  | "APROBADO"
  | "RECHAZADO"
  | "PENDIENTE"
  | "YA_PROCESADO"
  | "ORDEN_DESCONOCIDA"
  | "A_REVISAR";

/**
 * Aplica el resultado de un pago informado por la pasarela. Idempotente: la
 * pasarela reenvía los avisos y el mismo pago no se aplica dos veces. Todo en
 * una transacción que bloquea la orden, así dos avisos simultáneos no chocan.
 *
 * Un pago aprobado activa la orden solo si el importe y la moneda coinciden;
 * si no (o si la orden ya estaba pagada o cancelada), queda para revisión
 * manual y se avisa a SOFTeam: nunca se pierde un pago.
 */
export async function procesarPago(
  db: Db,
  pago: Pago,
  hoy: Fecha = hoyArgentina(),
): Promise<ResultadoAviso> {
  if (!ES_UUID.test(pago.ordenId)) return "ORDEN_DESCONOCIDA";
  return db.transaction(async (tx) => {
    const [orden] = await tx
      .select()
      .from(t.ordenes)
      .where(eq(t.ordenes.id, pago.ordenId))
      .for("update");
    if (!orden) return "ORDEN_DESCONOCIDA";
    if (orden.mpPagoId === pago.id && (pago.estado !== "APROBADO" || orden.estado === "PAGADA")) {
      return "YA_PROCESADO";
    }
    if (pago.estado === "PENDIENTE") return "PENDIENTE";

    const aRevisar = async (motivo: string) => {
      await tx
        .update(t.ordenes)
        .set({
          requiereRevision: true,
          observaciones: [orden.observaciones, `Pago ${pago.id}: ${motivo}`]
            .filter(Boolean)
            .join("\n"),
        })
        .where(eq(t.ordenes.id, orden.id));
      await registrarAlerta(tx, {
        tipo: "PAGO_RECHAZADO",
        clave: `PAGO_A_REVISAR:${pago.id}`,
        mensaje: `Orden #${orden.numero}: ${motivo}. Revisar el pago ${pago.id}.`,
        empresaId: orden.empresaId,
        ordenId: orden.id,
        paraCliente: false,
      });
      return "A_REVISAR" as const;
    };

    if (pago.estado === "RECHAZADO") {
      if (orden.estado !== "PEND_PAGO") return "YA_PROCESADO";
      await tx
        .update(t.ordenes)
        .set({
          pagoError: true,
          pagoErrorDetalle: (pago.detalle ?? "Pago rechazado").slice(0, 300),
          pagoErrorEn: new Date(),
          mpPagoId: pago.id,
        })
        .where(eq(t.ordenes.id, orden.id));
      await registrarAlerta(tx, {
        tipo: "PAGO_RECHAZADO",
        clave: `PAGO_RECHAZADO:${pago.id}`,
        mensaje: `No se pudo cobrar la orden #${orden.numero}. Probá de nuevo con otro medio desde el link de pago.`,
        empresaId: orden.empresaId,
        ordenId: orden.id,
      });
      await auditar(tx, {
        actorId: null,
        actorTipo: "pasarela",
        entidad: "orden",
        empresaId: orden.empresaId,
        entidadId: orden.id,
        accion: "pago_rechazado",
        despues: { pago: pago.id, detalle: pago.detalle },
      });
      return "RECHAZADO";
    }

    // Aprobado.
    if (orden.estado === "PAGADA") return aRevisar("pago aprobado de una orden ya pagada");
    if (orden.estado === "CANCELADA") return aRevisar("pago aprobado de una orden cancelada");
    if (pago.monto !== orden.total || pago.moneda !== orden.moneda) {
      return aRevisar(
        `el importe cobrado (${formatearMoneda(pago.monto, pago.moneda)}) no coincide con el de la orden (${formatearMoneda(orden.total, orden.moneda)})`,
      );
    }
    const resultado = await registrarPago(tx, orden.id, null, hoy, {
      actorTipo: "pasarela",
      mpPagoId: pago.id,
    });
    if (!resultado.ok) return "YA_PROCESADO";
    return "APROBADO";
  });
}
