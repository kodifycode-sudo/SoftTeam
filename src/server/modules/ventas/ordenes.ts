import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { Alcance } from "@/domain/cuentas/alcance";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { periodoAlta, puedeTransicionar } from "@/domain/licencias/contrato";
import { exito, type Resultado, rechazo } from "@/domain/resultado";
import type { Orden, Pagina } from "@/lib/listados";
import type { Db, Ejecutor, Tx } from "@/server/db/cliente";
import { ordenarPor, paginar, totalFiltrado } from "@/server/db/listados";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { ordenEnAlcance } from "../cuentas/alcance";
import { registrarCambioEmpresa } from "../integraciones/eventos";

export type EstadoOrden = "PEND_PAGO" | "PAGADA" | "CANCELADA";

export interface AlcanceOrden {
  empresaId?: string;
  clienteId?: string;
  /** Administrador delegado: solo las órdenes con contratos de sus oficinas. */
  alcance?: Alcance;
}

/**
 * Alcance del portal: las órdenes de la empresa, más las agrupadas (planilla)
 * que factura su cliente. Un delegado ve solo las compras de sus oficinas.
 * Sin empresa (panel SOFTeam), todas.
 */
export function alcanceDeOrden(alcance: AlcanceOrden) {
  if (!alcance.empresaId) return undefined;
  const delegado = alcance.alcance ? ordenEnAlcance(alcance.alcance) : undefined;
  if (delegado) return and(eq(t.ordenes.empresaId, alcance.empresaId), delegado);
  return or(
    eq(t.ordenes.empresaId, alcance.empresaId),
    alcance.clienteId
      ? and(eq(t.ordenes.agrupada, true), eq(t.ordenes.clienteFacturacionId, alcance.clienteId))
      : undefined,
  );
}

export const COLUMNAS_ORDENES = ["numero", "empresa", "emitida", "total"] as const;
export type ColumnaOrdenes = (typeof COLUMNAS_ORDENES)[number];

export async function listarOrdenes(
  db: Ejecutor,
  filtros: AlcanceOrden & {
    estado?: EstadoOrden;
    /** Solo las que tuvieron un pago rechazado. */
    conErrorDePago?: boolean;
    busqueda?: string;
    /** Sin página, devuelve todas (exportación). */
    pagina?: Pagina;
    orden?: Orden<ColumnaOrdenes>;
  } = {},
) {
  const numero = filtros.busqueda?.replace(/\D/g, "");
  const columnasOrden = {
    numero: t.ordenes.numero,
    empresa: sql`lower(coalesce(${t.empresas.nombre}, ${t.clientes.nombre}))`,
    emitida: t.ordenes.emitidaEn,
    total: t.ordenes.total,
  };
  const consulta = db
    .select({
      id: t.ordenes.id,
      numero: t.ordenes.numero,
      estado: t.ordenes.estado,
      total: t.ordenes.total,
      emitidaEn: t.ordenes.emitidaEn,
      pagadaEn: t.ordenes.pagadaEn,
      pagoError: t.ordenes.pagoError,
      agrupada: t.ordenes.agrupada,
      tipoGeneracion: t.ordenes.tipoGeneracion,
      requiereRevision: t.ordenes.requiereRevision,
      facturaNumero: t.ordenes.facturaNumero,
      medio: t.mediosPago.nombre,
      empresa: t.empresas.nombre,
      empresaNumero: t.empresas.numero,
      cliente: t.clientes.nombre,
      items: sql<number>`(select count(*)::int from ${t.ordenItems} oi where oi.orden_id = ${t.ordenes.id})`,
      totalFilas: totalFiltrado(),
    })
    .from(t.ordenes)
    .innerJoin(t.mediosPago, eq(t.mediosPago.id, t.ordenes.medioPagoId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.ordenes.clienteId))
    .leftJoin(t.empresas, eq(t.empresas.id, t.ordenes.empresaId))
    .where(
      and(
        alcanceDeOrden(filtros),
        filtros.estado ? eq(t.ordenes.estado, filtros.estado) : undefined,
        filtros.conErrorDePago ? eq(t.ordenes.pagoError, true) : undefined,
        numero ? eq(t.ordenes.numero, Number(numero)) : undefined,
      ),
    )
    .orderBy(
      ...ordenarPor(
        columnasOrden,
        filtros.orden ?? { columna: "emitida", direccion: "desc" },
        t.ordenes.numero,
      ),
    )
    .$dynamic();
  return paginar(consulta, filtros.pagina);
}

/**
 * Orden con sus líneas, contratos y medio de pago. Con `empresaId`, solo la
 * devuelve si pertenece a esa empresa (el portal nunca ve órdenes ajenas).
 */
export async function obtenerOrden(db: Ejecutor, ordenId: string, alcance: AlcanceOrden = {}) {
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
    .where(and(eq(t.ordenes.id, ordenId), alcanceDeOrden(alcance)));
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
  db: Db | Tx,
  ordenId: string,
  actorId: string | null,
  hoy: Fecha = hoyArgentina(),
  opciones: { actorTipo?: string; mpPagoId?: string } = {},
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
        ...(opciones.mpPagoId ? { mpPagoId: opciones.mpPagoId } : {}),
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
      // Pagada la renovación, rige el contrato nuevo: el anterior deja de estar prorrogado.
      if (contrato.contratoAnteriorId) {
        await tx
          .update(t.contratos)
          .set({ prorrogaHasta: null })
          .where(eq(t.contratos.id, contrato.contratoAnteriorId));
      }

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
      actorTipo: opciones.actorTipo ?? "usuario",
      entidad: "orden",
      empresaId: orden.empresaId,
      entidadId: ordenId,
      accion: "registrar_pago",
      despues: {
        contratosActivados: contratos.length,
        ...(opciones.mpPagoId ? { pago: opciones.mpPagoId } : {}),
      },
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
      empresaId: orden.empresaId,
      entidadId: ordenId,
      accion: "cancelar",
      motivo,
    });
    return exito({ ok: true as const });
  });
}

/** SOFTeam revisó una orden marcada para revisión (pago que no coincidía, etc.). */
export async function marcarOrdenRevisada(db: Db, ordenId: string, actorId: string) {
  await db.transaction(async (tx) => {
    await tx.update(t.ordenes).set({ requiereRevision: false }).where(eq(t.ordenes.id, ordenId));
    await auditar(tx, { actorId, entidad: "orden", entidadId: ordenId, accion: "revisada" });
  });
}

/** Acredita el saldo prepago de un contrato (movimientos de CARGA en el libro). */
export async function cargarSaldos(
  tx: Ejecutor,
  contratoId: string,
  recursos: { recursoId: string; cantidad: number; clase: string }[],
  unidades: number,
  observacion: string,
) {
  const saldos = recursos.filter((r) => r.clase === "SALDO" && r.cantidad > 0);
  if (saldos.length === 0) return;
  await tx.insert(t.movimientosSaldo).values(
    saldos.map((r) => ({
      contratoId,
      recursoId: r.recursoId,
      clase: "SALDO" as const,
      tipo: "CARGA" as const,
      creditos: r.cantidad * unidades,
      observacion,
    })),
  );
}
