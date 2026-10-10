import { and, asc, desc, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { centavos } from "@/domain/dinero";
import { saldoDeTicket } from "@/domain/facturacion/ticket";
import { esPosterior, type Fecha, hoy as hoyArgentina, sumarMeses } from "@/domain/fecha";
import type { Rango } from "@/domain/reportes/periodos";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { enRango } from "./reportes";

/*
 * Reportes comerciales para SOFTeam: tickets, bonificaciones, renovaciones y
 * consumibles. Los rangos son de fechas de Argentina, con `hasta` exclusivo.
 */

/** Mes "AAAA-MM" de un instante, en hora de Argentina. */
const mesArgentina = (columna: unknown) =>
  sql<string>`to_char(${columna} - interval '3 hours', 'YYYY-MM')`;

// ─── Tickets ─────────────────────────────────────────────────────────────────

/** Por ticket, en el rango: usos (compras), renovaciones que lo heredaron y lo descontado. */
export async function resumenTickets(db: Ejecutor, rango: Rango) {
  const filas = await db
    .select({
      ticketId: t.tickets.id,
      codigo: t.tickets.codigo,
      porcentaje: t.tickets.porcentaje,
      tope: t.tickets.tope,
      usos: sql<number>`count(*) filter (where ${t.ordenes.tipoGeneracion} = 'MANUAL')::int`,
      renovaciones: sql<number>`count(*) filter (where ${t.ordenes.tipoGeneracion} = 'RENOVACION')::int`,
      descontado: sql<string>`coalesce(sum(${t.ordenes.ticketDescuento}), 0)::text`,
    })
    .from(t.ordenes)
    .innerJoin(t.tickets, eq(t.tickets.id, t.ordenes.ticketId))
    .where(and(ne(t.ordenes.estado, "CANCELADA"), enRango(t.ordenes.emitidaEn, rango)))
    .groupBy(t.tickets.id)
    .orderBy(desc(sql`sum(${t.ordenes.ticketDescuento})`));
  return filas.map((f) => ({ ...f, descontado: centavos(f.descontado) }));
}

export type EstadoSerie = "VIGENTE" | "AGOTADA" | "VENCIDA";

/**
 * Series de órdenes con ticket que empezaron en el rango (la compra donde se
 * aplicó y las renovaciones que lo heredan): lo descontado en toda la serie y
 * el saldo que queda del tope. La herencia vence a los 12 meses.
 */
export async function seriesDeTickets(db: Ejecutor, rango: Rango, hoy: Fecha = hoyArgentina()) {
  const filas = await db
    .select({
      ordenId: t.ordenes.id,
      orden: t.ordenes.numero,
      emitidaEn: t.ordenes.emitidaEn,
      codigo: t.tickets.codigo,
      tope: t.tickets.tope,
      cliente: t.clientes.nombre,
      renovaciones: sql<number>`(select count(*)::int from ${t.ordenes} r where r.orden_origen_id = ${t.ordenes.id} and r.ticket_id = ${t.ordenes.ticketId} and r.estado <> 'CANCELADA')`,
      descontado: sql<string>`(select coalesce(sum(r.ticket_descuento), 0)::text from ${t.ordenes} r where (r.id = ${t.ordenes.id} or r.orden_origen_id = ${t.ordenes.id}) and r.ticket_id = ${t.ordenes.ticketId} and r.estado <> 'CANCELADA')`,
    })
    .from(t.ordenes)
    .innerJoin(t.tickets, eq(t.tickets.id, t.ordenes.ticketId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.ordenes.clienteId))
    .where(
      and(
        eq(t.ordenes.tipoGeneracion, "MANUAL"),
        ne(t.ordenes.estado, "CANCELADA"),
        enRango(t.ordenes.emitidaEn, rango),
      ),
    )
    .orderBy(desc(t.ordenes.emitidaEn));
  return filas.map((f) => {
    const descontado = centavos(f.descontado);
    const saldo = saldoDeTicket(f.tope, descontado);
    const vence = sumarMeses(hoyArgentina(f.emitidaEn), 12);
    const estado: EstadoSerie =
      saldo !== null && saldo <= 0n ? "AGOTADA" : esPosterior(hoy, vence) ? "VENCIDA" : "VIGENTE";
    return { ...f, descontado, saldo, vence, estado };
  });
}

// ─── Bonificaciones ──────────────────────────────────────────────────────────

/**
 * Paquetes bonificados en órdenes emitidas en el rango (no canceladas): cuánto,
 * por qué, si es recurrente y quién la otorgó (el último usuario que bonificó o
 * armó la orden; las renovaciones la heredan del contrato anterior).
 */
export async function bonificacionesOtorgadas(db: Ejecutor, rango: Rango) {
  const filas = await db
    .select({
      contratoId: t.contratos.id,
      ordenId: t.ordenes.id,
      orden: t.ordenes.numero,
      emitidaEn: t.ordenes.emitidaEn,
      tipoGeneracion: t.ordenes.tipoGeneracion,
      cliente: t.clientes.nombre,
      empresa: t.empresas.nombre,
      paquete: t.paquetes.nombre,
      porcentaje: t.contratos.bonifPorcentaje,
      recurrente: t.contratos.bonifRecurrente,
      motivo: t.contratos.bonifMotivo,
      bonificado: t.ordenItems.bonificacion,
      otorgadaPor: sql<
        string | null
      >`(select u.name from ${t.auditoria} a join ${t.usuarios} u on u.id = a.actor_id where a.entidad = 'orden' and a.entidad_id = ${t.ordenes.id}::text and a.accion in ('bonificacion', 'confirmar') order by a.en desc limit 1)`,
    })
    .from(t.contratos)
    .innerJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
    .innerJoin(t.ordenItems, eq(t.ordenItems.contratoId, t.contratos.id))
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .where(
      and(
        gt(t.contratos.bonifPorcentaje, 0n),
        ne(t.ordenes.estado, "CANCELADA"),
        enRango(t.ordenes.emitidaEn, rango),
      ),
    )
    .orderBy(desc(t.ordenes.emitidaEn));
  return filas.map((f) => ({
    ...f,
    otorgadaPor:
      f.otorgadaPor ?? (f.tipoGeneracion === "RENOVACION" ? "Renovación (recurrente)" : null),
  }));
}

// ─── Renovaciones ────────────────────────────────────────────────────────────

/**
 * Renovaciones automáticas por mes de emisión: órdenes generadas, cuántas se
 * pagaron, cuántas siguen impagas y lo cobrado como días proporcionales.
 */
export async function renovacionesPorMes(db: Ejecutor, meses: readonly string[]) {
  const rango: Rango = {
    desde: `${meses[0]}-01` as Fecha,
    hasta: sumarMeses(`${meses.at(-1)}-01` as Fecha, 1),
  };
  const [ordenes, proporcional] = await Promise.all([
    db
      .select({
        mes: mesArgentina(t.ordenes.emitidaEn),
        ordenes: sql<number>`count(*) filter (where ${t.ordenes.estado} <> 'CANCELADA')::int`,
        emitido: sql<string>`coalesce(sum(${t.ordenes.total}) filter (where ${t.ordenes.estado} <> 'CANCELADA'), 0)::text`,
        pagadas: sql<number>`count(*) filter (where ${t.ordenes.estado} = 'PAGADA')::int`,
        cobrado: sql<string>`coalesce(sum(${t.ordenes.total}) filter (where ${t.ordenes.estado} = 'PAGADA'), 0)::text`,
        impagas: sql<number>`count(*) filter (where ${t.ordenes.estado} = 'PEND_PAGO')::int`,
        pendiente: sql<string>`coalesce(sum(${t.ordenes.total}) filter (where ${t.ordenes.estado} = 'PEND_PAGO'), 0)::text`,
        canceladas: sql<number>`count(*) filter (where ${t.ordenes.estado} = 'CANCELADA')::int`,
      })
      .from(t.ordenes)
      .where(and(eq(t.ordenes.tipoGeneracion, "RENOVACION"), enRango(t.ordenes.emitidaEn, rango)))
      .groupBy(mesArgentina(t.ordenes.emitidaEn)),
    db
      .select({
        mes: mesArgentina(t.ordenes.emitidaEn),
        dias: sql<number>`coalesce(sum(${t.contratos.prorrataDias}), 0)::int`,
        importe: sql<string>`coalesce(sum(${t.contratos.prorrataImporte}), 0)::text`,
      })
      .from(t.contratos)
      .innerJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
      .where(
        and(
          eq(t.ordenes.tipoGeneracion, "RENOVACION"),
          ne(t.ordenes.estado, "CANCELADA"),
          enRango(t.ordenes.emitidaEn, rango),
        ),
      )
      .groupBy(mesArgentina(t.ordenes.emitidaEn)),
  ]);
  return meses.map((mes) => {
    const o = ordenes.find((x) => x.mes === mes);
    const p = proporcional.find((x) => x.mes === mes);
    return {
      mes,
      ordenes: o?.ordenes ?? 0,
      emitido: centavos(o?.emitido ?? "0"),
      pagadas: o?.pagadas ?? 0,
      cobrado: centavos(o?.cobrado ?? "0"),
      impagas: o?.impagas ?? 0,
      pendiente: centavos(o?.pendiente ?? "0"),
      canceladas: o?.canceladas ?? 0,
      diasProporcionales: p?.dias ?? 0,
      proporcional: centavos(p?.importe ?? "0"),
    };
  });
}

/**
 * Trimestres iniciales que vencen en el rango: si ya se negoció su primera
 * renovación (con qué orden) o si sigue pendiente.
 */
export async function trimestresIniciales(db: Ejecutor, rango: Rango) {
  return db
    .select({
      contratoId: t.contratos.id,
      hasta: t.contratos.hasta,
      paquete: t.paquetes.nombre,
      empresa: t.empresas.nombre,
      clienteId: t.clientes.id,
      cliente: t.clientes.nombre,
      renovacion: sql<
        number | null
      >`(select o.numero from ${t.contratos} r join ${t.ordenes} o on o.id = r.orden_id where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO' limit 1)`,
      renovacionEstado: sql<
        string | null
      >`(select o.estado from ${t.contratos} r join ${t.ordenes} o on o.id = r.orden_id where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO' limit 1)`,
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .where(
      and(
        eq(t.contratos.tipoPaquete, "TEMPORAL"),
        isNull(t.contratos.diaVenc),
        ne(t.contratos.estado, "CANCELADO"),
        isNotNull(t.contratos.hasta),
        sql`${t.contratos.hasta} >= ${rango.desde} and ${t.contratos.hasta} < ${rango.hasta}`,
      ),
    )
    .orderBy(asc(t.contratos.hasta));
}

// ─── Consumibles ─────────────────────────────────────────────────────────────

/** Consumibles renovados por saldo en el rango, con su orden (o la colectiva pendiente). */
export async function consumiblesRenovados(db: Ejecutor, rango: Rango) {
  return db
    .select({
      contratoId: t.contratos.id,
      creadoEn: t.contratos.creadoEn,
      paquete: t.paquetes.nombre,
      cantidad: t.contratos.cantidad,
      empresa: t.empresas.nombre,
      estado: t.contratos.estado,
      ordenId: t.ordenes.id,
      orden: t.ordenes.numero,
      ordenEstado: t.ordenes.estado,
      total: t.ordenes.total,
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .leftJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
    .where(
      and(
        eq(t.contratos.tipoPaquete, "CONSUMIBLE"),
        eq(t.contratos.tipoAccion, "RENOVACION"),
        enRango(t.contratos.creadoEn, rango),
      ),
    )
    .orderBy(desc(t.contratos.creadoEn));
}

/** Pedidos de consumo que no alcanzaron el saldo, por empresa y familia. */
export async function pedidosSinSaldo(db: Ejecutor, rango: Rango) {
  return db
    .select({
      empresaId: t.empresas.id,
      empresa: t.empresas.nombre,
      empresaNumero: t.empresas.numero,
      familia: t.consumos.familia,
      parciales: sql<number>`count(*) filter (where ${t.consumos.resultado} = 'PARCIAL')::int`,
      sinSaldo: sql<number>`count(*) filter (where ${t.consumos.resultado} = 'SIN_SALDO')::int`,
      solicitado: sql<number>`coalesce(sum(${t.consumos.creditosSolicitados}), 0)::int`,
      entregado: sql<number>`coalesce(sum(${t.consumos.creditosConsumidos}), 0)::int`,
    })
    .from(t.consumos)
    .innerJoin(t.empresas, eq(t.empresas.id, t.consumos.empresaId))
    .where(
      and(
        eq(t.consumos.tipo, "SOLICITUD"),
        ne(t.consumos.resultado, "OK"),
        enRango(t.consumos.registradoEn, rango),
      ),
    )
    .groupBy(t.empresas.id, t.consumos.familia)
    .orderBy(desc(sql`count(*)`));
}
