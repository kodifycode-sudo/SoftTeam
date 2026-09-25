import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { periodoAlta, puedeTransicionar } from "@/domain/licencias/contrato";
import { exito, type Resultado, rechazo } from "@/domain/resultado";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { cargarSaldos } from "./checkout";

export type EstadoOrden = "PEND_PAGO" | "PAGADA" | "CANCELADA";

export async function listarOrdenes(
  db: Ejecutor,
  filtros: { empresaId?: string; estado?: EstadoOrden; busqueda?: string } = {},
) {
  const numero = filtros.busqueda?.replace(/\D/g, "");
  return db
    .select({
      id: t.ordenes.id,
      numero: t.ordenes.numero,
      estado: t.ordenes.estado,
      total: t.ordenes.total,
      emitidaEn: t.ordenes.emitidaEn,
      pagadaEn: t.ordenes.pagadaEn,
      pagoError: t.ordenes.pagoError,
      medio: t.mediosPago.nombre,
      empresa: t.empresas.nombre,
      empresaNumero: t.empresas.numero,
      cliente: t.clientes.nombre,
      items: sql<number>`(select count(*)::int from ${t.ordenItems} oi where oi.orden_id = ${t.ordenes.id})`,
    })
    .from(t.ordenes)
    .innerJoin(t.mediosPago, eq(t.mediosPago.id, t.ordenes.medioPagoId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.ordenes.clienteId))
    .leftJoin(t.empresas, eq(t.empresas.id, t.ordenes.empresaId))
    .where(
      and(
        filtros.empresaId ? eq(t.ordenes.empresaId, filtros.empresaId) : undefined,
        filtros.estado ? eq(t.ordenes.estado, filtros.estado) : undefined,
        numero ? eq(t.ordenes.numero, Number(numero)) : undefined,
      ),
    )
    .orderBy(desc(t.ordenes.emitidaEn))
    .limit(200);
}

/**
 * Orden con sus líneas, contratos y medio de pago. Con `empresaId`, solo la
 * devuelve si pertenece a esa empresa (el portal nunca ve órdenes ajenas).
 */
export async function obtenerOrden(
  db: Ejecutor,
  ordenId: string,
  alcance: { empresaId?: string } = {},
) {
  const [orden] = await db
    .select({
      orden: t.ordenes,
      medio: {
        nombre: t.mediosPago.nombre,
        tipo: t.mediosPago.tipo,
        generaLink: t.mediosPago.generaLink,
        instrucciones: t.mediosPago.instrucciones,
      },
      empresa: { id: t.empresas.id, nombre: t.empresas.nombre, numero: t.empresas.numero },
    })
    .from(t.ordenes)
    .innerJoin(t.mediosPago, eq(t.mediosPago.id, t.ordenes.medioPagoId))
    .leftJoin(t.empresas, eq(t.empresas.id, t.ordenes.empresaId))
    .where(
      and(
        eq(t.ordenes.id, ordenId),
        alcance.empresaId ? eq(t.ordenes.empresaId, alcance.empresaId) : undefined,
      ),
    );
  if (!orden) return undefined;

  const [lineas, facturacion, ticket] = await Promise.all([
    db
      .select({
        id: t.ordenItems.id,
        descripcion: t.ordenItems.descripcion,
        precioLista: t.ordenItems.precioLista,
        bonificacion: t.ordenItems.bonificacion,
        precioFinal: t.ordenItems.precioFinal,
        totalProrrateado: t.ordenItems.totalProrrateado,
        contratoId: t.contratos.id,
        estadoContrato: t.contratos.estado,
        desde: t.contratos.desde,
        hasta: t.contratos.hasta,
        tipoPaquete: t.contratos.tipoPaquete,
      })
      .from(t.ordenItems)
      .innerJoin(t.contratos, eq(t.contratos.id, t.ordenItems.contratoId))
      .where(eq(t.ordenItems.ordenId, ordenId))
      .orderBy(asc(t.ordenItems.descripcion)),
    db.query.clientes.findFirst({
      columns: { id: true, nombreFactura: true, cuit: true },
      where: eq(t.clientes.id, orden.orden.clienteFacturacionId),
    }),
    orden.orden.ticketId
      ? db.query.tickets.findFirst({
          columns: { codigo: true },
          where: eq(t.tickets.id, orden.orden.ticketId),
        })
      : undefined,
  ]);
  return { ...orden, lineas, facturacion, ticket };
}

export type DetalleOrden = NonNullable<Awaited<ReturnType<typeof obtenerOrden>>>;

export type ErrorOrden = "NO_EXISTE" | "NO_PENDIENTE";

/**
 * Registra el pago de una orden y activa sus contratos. Un contrato que
 * todavía no tiene período (cliente directo) arranca el día del pago; uno
 * que ya lo tiene (corporativo habilitado, renovación) lo conserva. Los
 * saldos prepagos se acreditan una sola vez.
 */
export async function registrarPago(
  db: Db,
  ordenId: string,
  actorId: string,
  hoy: Fecha = hoyArgentina(),
): Promise<Resultado<{ contratosActivados: number }, ErrorOrden>> {
  return db.transaction(async (tx) => {
    const [orden] = await tx
      .select()
      .from(t.ordenes)
      .where(eq(t.ordenes.id, ordenId))
      .for("update");
    if (!orden) return rechazo("NO_EXISTE");
    if (orden.estado !== "PEND_PAGO") return rechazo("NO_PENDIENTE");

    const ahora = new Date();
    await tx
      .update(t.ordenes)
      .set({
        estado: "PAGADA",
        pagadaEn: ahora,
        pagoError: false,
        version: sql`${t.ordenes.version} + 1`,
      })
      .where(eq(t.ordenes.id, ordenId));

    const contratos = await tx
      .select()
      .from(t.contratos)
      .where(
        and(
          eq(t.contratos.ordenId, ordenId),
          inArray(t.contratos.estado, ["PEND_PAGO", "PEND_PAGO_ACTIVO"]),
        ),
      );

    for (const contrato of contratos) {
      if (!puedeTransicionar(contrato.estado, "ACTIVO")) continue;
      const periodo =
        contrato.desde === null && contrato.tipoPaquete === "TEMPORAL" && contrato.meses
          ? periodoAlta(hoy, contrato.meses)
          : null;
      await tx
        .update(t.contratos)
        .set({
          estado: "ACTIVO",
          activadoEn: ahora,
          pendPagoActivoHasta: null,
          desde: periodo?.desde ?? contrato.desde ?? hoy,
          hasta: periodo?.hasta ?? contrato.hasta,
        })
        .where(eq(t.contratos.id, contrato.id));

      const yaCargado = await tx.query.movimientosSaldo.findFirst({
        columns: { id: true },
        where: and(
          eq(t.movimientosSaldo.contratoId, contrato.id),
          eq(t.movimientosSaldo.tipo, "CARGA"),
        ),
      });
      if (!yaCargado) {
        const recursos = await tx
          .select({
            recursoId: t.contratoRecursos.recursoId,
            cantidad: t.contratoRecursos.cantidad,
            clase: t.contratoRecursos.clase,
          })
          .from(t.contratoRecursos)
          .where(eq(t.contratoRecursos.contratoId, contrato.id));
        // contrato_recursos ya tiene las unidades multiplicadas.
        await cargarSaldos(tx, contrato.id, recursos, 1, `Pago de la orden #${orden.numero}`);
      }
    }

    await registrarCambioEmpresa(
      tx,
      contratos.map((c) => c.empresaId),
      ahora,
    );
    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "orden",
      entidadId: ordenId,
      accion: "registrar_pago",
      despues: { contratosActivados: contratos.length },
    });
    return exito({ contratosActivados: contratos.length });
  });
}

/** Cancela una orden pendiente y sus contratos. Siempre manual y con motivo. */
export async function cancelarOrden(
  db: Db,
  ordenId: string,
  actorId: string,
  motivo: string,
): Promise<Resultado<{ ok: true }, ErrorOrden>> {
  return db.transaction(async (tx) => {
    const [orden] = await tx
      .select()
      .from(t.ordenes)
      .where(eq(t.ordenes.id, ordenId))
      .for("update");
    if (!orden) return rechazo("NO_EXISTE");
    if (orden.estado !== "PEND_PAGO") return rechazo("NO_PENDIENTE");
    const ahora = new Date();
    await tx
      .update(t.ordenes)
      .set({ estado: "CANCELADA", canceladaEn: ahora, version: sql`${t.ordenes.version} + 1` })
      .where(eq(t.ordenes.id, ordenId));
    const cancelados = await tx
      .update(t.contratos)
      .set({ estado: "CANCELADO" })
      .where(
        and(
          eq(t.contratos.ordenId, ordenId),
          inArray(t.contratos.estado, ["PEND_PAGO", "PEND_PAGO_ACTIVO"]),
        ),
      )
      .returning({ empresaId: t.contratos.empresaId });
    await registrarCambioEmpresa(
      tx,
      cancelados.map((c) => c.empresaId),
      ahora,
    );
    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "orden",
      entidadId: ordenId,
      accion: "cancelar",
      motivo,
    });
    return exito({ ok: true as const });
  });
}
