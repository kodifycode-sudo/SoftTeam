import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { type Alcance, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import { centavos } from "@/domain/dinero";
import { diasEntre, type Fecha, inicioDeMes, sumarDias, sumarMeses } from "@/domain/fecha";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { oficinaEnAlcance } from "../cuentas/alcance";

/*
 * Reportes para SOFTeam. Los meses se cuentan en hora de Argentina (UTC−3,
 * sin horario de verano), igual que el resto del sistema.
 */

/** Mes "AAAA-MM" de un instante, en hora de Argentina. */
const mesArgentina = (columna: unknown) =>
  sql<string>`to_char(${columna} - interval '3 hours', 'YYYY-MM')`;

/** Instante en que empieza una fecha en Argentina. */
const inicioArgentina = (f: Fecha) => new Date(`${f}T03:00:00Z`);

/** Lista de meses "AAAA-MM" desde `desde` hasta el mes de `hoy`. */
function mesesHasta(hoy: Fecha, cantidad: number): string[] {
  const inicio = sumarMeses(inicioDeMes(hoy), -(cantidad - 1));
  return Array.from({ length: cantidad }, (_, i) => sumarMeses(inicio, i).slice(0, 7));
}

// ─── Cobranza ────────────────────────────────────────────────────────────────

export interface FilaCobranza {
  mes: string;
  ordenes: number;
  emitido: bigint;
  cobrado: bigint;
  pendiente: bigint;
}

/**
 * Por mes: lo emitido (órdenes no canceladas emitidas en el mes), lo cobrado
 * (órdenes pagadas en el mes, sin importar cuándo se emitieron) y lo que de
 * lo emitido sigue pendiente.
 */
export async function cobranzaPorMes(
  db: Ejecutor,
  hoy: Fecha,
  meses = 12,
): Promise<FilaCobranza[]> {
  const lista = mesesHasta(hoy, meses);
  const desde = inicioArgentina(`${lista[0]}-01` as Fecha);
  const [emitidas, cobradas] = await Promise.all([
    db
      .select({
        mes: mesArgentina(t.ordenes.emitidaEn),
        ordenes: sql<number>`count(*)::int`,
        emitido: sql<string>`coalesce(sum(${t.ordenes.total}), 0)::text`,
        pendiente: sql<string>`coalesce(sum(${t.ordenes.total}) filter (where ${t.ordenes.estado} = 'PEND_PAGO'), 0)::text`,
      })
      .from(t.ordenes)
      .where(and(gte(t.ordenes.emitidaEn, desde), ne(t.ordenes.estado, "CANCELADA")))
      .groupBy(mesArgentina(t.ordenes.emitidaEn)),
    db
      .select({
        mes: mesArgentina(t.ordenes.pagadaEn),
        cobrado: sql<string>`coalesce(sum(${t.ordenes.total}), 0)::text`,
      })
      .from(t.ordenes)
      .where(and(eq(t.ordenes.estado, "PAGADA"), gte(t.ordenes.pagadaEn, desde)))
      .groupBy(mesArgentina(t.ordenes.pagadaEn)),
  ]);
  return lista.map((mes) => {
    const e = emitidas.find((x) => x.mes === mes);
    const c = cobradas.find((x) => x.mes === mes);
    return {
      mes,
      ordenes: e?.ordenes ?? 0,
      emitido: centavos(e?.emitido ?? "0"),
      cobrado: centavos(c?.cobrado ?? "0"),
      pendiente: centavos(e?.pendiente ?? "0"),
    };
  });
}

export interface OrdenPendiente {
  id: string;
  numero: number;
  empresa: string | null;
  cliente: string;
  medio: string;
  total: bigint;
  emitidaEn: Date;
  dias: number;
  tipoGeneracion: "MANUAL" | "RENOVACION";
  pagoError: boolean;
}

/** Órdenes impagas, de la más antigua a la más nueva, con sus días de antigüedad. */
export async function ordenesPendientes(db: Ejecutor, hoy: Fecha): Promise<OrdenPendiente[]> {
  const filas = await db
    .select({
      id: t.ordenes.id,
      numero: t.ordenes.numero,
      empresa: t.empresas.nombre,
      cliente: t.clientes.nombre,
      medio: t.mediosPago.nombre,
      total: t.ordenes.total,
      emitidaEn: t.ordenes.emitidaEn,
      tipoGeneracion: t.ordenes.tipoGeneracion,
      pagoError: t.ordenes.pagoError,
      emitida: sql<string>`to_char(${t.ordenes.emitidaEn} - interval '3 hours', 'YYYY-MM-DD')`,
    })
    .from(t.ordenes)
    .innerJoin(t.clientes, eq(t.clientes.id, t.ordenes.clienteId))
    .innerJoin(t.mediosPago, eq(t.mediosPago.id, t.ordenes.medioPagoId))
    .leftJoin(t.empresas, eq(t.empresas.id, t.ordenes.empresaId))
    .where(eq(t.ordenes.estado, "PEND_PAGO"))
    .orderBy(asc(t.ordenes.emitidaEn));
  return filas.map(({ emitida, ...f }) => ({ ...f, dias: diasEntre(emitida as Fecha, hoy) }));
}

// ─── Vencimientos ────────────────────────────────────────────────────────────

export type EstadoRenovacionReporte = "NO_RENOVAR" | "SIN_ORDEN" | "ORDEN_PENDIENTE" | "RENOVADO";

export interface FilaVencimiento {
  contratoId: string;
  empresaId: string;
  empresa: string;
  empresaNumero: number;
  paquete: string;
  cantidad: number;
  hasta: Fecha;
  dias: number;
  estado: EstadoRenovacionReporte;
  ordenRenovacion: number | null;
}

/**
 * Paquetes temporales que vencen en los próximos días, o que vencieron hace
 * poco y no se renovaron, con el estado de su renovación.
 */
export async function vencimientos(
  db: Ejecutor,
  hoy: Fecha,
  opciones: { proximosDias?: number; vencidosDias?: number } = {},
): Promise<FilaVencimiento[]> {
  const proximos = opciones.proximosDias ?? 30;
  const vencidos = opciones.vencidosDias ?? 30;
  const filas = await db
    .select({
      contratoId: t.contratos.id,
      empresaId: t.empresas.id,
      empresa: t.empresas.nombre,
      empresaNumero: t.empresas.numero,
      paquete: t.paquetes.nombre,
      cantidad: t.contratos.cantidad,
      hasta: t.contratos.hasta,
      noRenovar: t.contratos.noRenovar,
      renovacionEstado: sql<
        string | null
      >`(select r.estado from ${t.contratos} r where r.contrato_anterior_id = "contratos"."id" and r.estado <> 'CANCELADO' limit 1)`,
      renovacionOrden: sql<
        number | null
      >`(select o.numero from ${t.contratos} r join ${t.ordenes} o on o.id = r.orden_id where r.contrato_anterior_id = "contratos"."id" and r.estado <> 'CANCELADO' limit 1)`,
    })
    .from(t.contratos)
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .where(
      and(
        eq(t.empresas.activa, true),
        eq(t.contratos.tipoPaquete, "TEMPORAL"),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        gte(t.contratos.hasta, sumarDias(hoy, -vencidos)),
        lte(t.contratos.hasta, sumarDias(hoy, proximos)),
      ),
    )
    .orderBy(asc(t.contratos.hasta), asc(t.empresas.nombre));

  return (
    filas
      .map((f) => {
        const hasta = f.hasta as Fecha;
        const estado: EstadoRenovacionReporte = f.noRenovar
          ? "NO_RENOVAR"
          : !f.renovacionEstado
            ? "SIN_ORDEN"
            : f.renovacionEstado === "PEND_PAGO"
              ? "ORDEN_PENDIENTE"
              : "RENOVADO";
        return {
          contratoId: f.contratoId,
          empresaId: f.empresaId,
          empresa: f.empresa,
          empresaNumero: f.empresaNumero,
          paquete: f.paquete,
          cantidad: f.cantidad,
          hasta,
          dias: diasEntre(hoy, hasta),
          estado,
          ordenRenovacion: f.renovacionOrden,
        };
      })
      // Un vencido que ya se renovó no es un problema: no se lista.
      .filter((f) => f.dias >= 0 || f.estado !== "RENOVADO")
  );
}

// ─── Consumos ────────────────────────────────────────────────────────────────

export interface FilaConsumoMes {
  mes: string;
  familia: string;
  creditos: number;
  operaciones: number;
}

export async function consumosPorMes(
  db: Ejecutor,
  hoy: Fecha,
  meses = 6,
): Promise<FilaConsumoMes[]> {
  const lista = mesesHasta(hoy, meses);
  const desde = inicioArgentina(`${lista[0]}-01` as Fecha);
  const filas = await db
    .select({
      mes: mesArgentina(t.consumos.registradoEn),
      familia: t.consumos.familia,
      creditos: sql<number>`coalesce(sum(${t.consumos.creditosConsumidos}), 0)::int`,
      operaciones: sql<number>`count(*)::int`,
    })
    .from(t.consumos)
    .where(gte(t.consumos.registradoEn, desde))
    .groupBy(mesArgentina(t.consumos.registradoEn), t.consumos.familia);
  return filas.sort((a, b) => a.mes.localeCompare(b.mes) || a.familia.localeCompare(b.familia));
}

export interface FilaConsumoEmpresa {
  empresaId: string;
  empresa: string;
  empresaNumero: number;
  familia: string;
  creditos: number;
  operaciones: number;
}

/** Quién más consumió en un mes ("AAAA-MM"). */
export async function consumosPorEmpresa(
  db: Ejecutor,
  mes: string,
  limite = 50,
): Promise<FilaConsumoEmpresa[]> {
  const desde = inicioArgentina(`${mes}-01` as Fecha);
  const hasta = inicioArgentina(sumarMeses(`${mes}-01` as Fecha, 1));
  return db
    .select({
      empresaId: t.empresas.id,
      empresa: t.empresas.nombre,
      empresaNumero: t.empresas.numero,
      familia: t.consumos.familia,
      creditos: sql<number>`coalesce(sum(${t.consumos.creditosConsumidos}), 0)::int`,
      operaciones: sql<number>`count(*)::int`,
    })
    .from(t.consumos)
    .innerJoin(t.empresas, eq(t.empresas.id, t.consumos.empresaId))
    .where(and(gte(t.consumos.registradoEn, desde), lt(t.consumos.registradoEn, hasta)))
    .groupBy(t.empresas.id, t.empresas.nombre, t.empresas.numero, t.consumos.familia)
    .orderBy(desc(sql`sum(${t.consumos.creditosConsumidos})`))
    .limit(limite);
}

// ─── Licencias y ventas ──────────────────────────────────────────────────────

export interface FilaProducto {
  productoId: string;
  producto: string;
  empresas: number;
}

/** Empresas activas con cada producto licenciado hoy. */
export async function empresasPorProducto(db: Ejecutor, hoy: Fecha): Promise<FilaProducto[]> {
  const filas = await db
    .select({
      productoId: t.productos.id,
      producto: t.productos.nombre,
      empresas: sql<number>`count(distinct ${t.contratos.empresaId})::int`,
    })
    .from(t.contratos)
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.contratoRecursos, eq(t.contratoRecursos.contratoId, t.contratos.id))
    .innerJoin(t.recursos, eq(t.recursos.id, t.contratoRecursos.recursoId))
    .innerJoin(t.productos, eq(t.productos.id, t.recursos.productoId))
    .where(
      and(
        eq(t.empresas.activa, true),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        lte(t.contratos.desde, hoy),
        or(isNull(t.contratos.hasta), gte(t.contratos.hasta, hoy)),
        sql`${t.contratoRecursos.cantidad} > 0`,
      ),
    )
    .groupBy(t.productos.id, t.productos.nombre, t.productos.orden)
    .orderBy(asc(t.productos.orden));
  return filas;
}

export interface FilaVentaPaquete {
  paquete: string;
  altas: number;
  renovaciones: number;
  facturado: bigint;
}

/** Paquetes vendidos en los últimos meses (altas y renovaciones de órdenes no canceladas). */
export async function ventasPorPaquete(
  db: Ejecutor,
  hoy: Fecha,
  meses = 12,
): Promise<FilaVentaPaquete[]> {
  const desde = inicioArgentina(sumarMeses(inicioDeMes(hoy), -(meses - 1)));
  const filas = await db
    .select({
      paquete: t.paquetes.nombre,
      altas: sql<number>`count(*) filter (where ${t.contratos.tipoAccion} = 'ALTA')::int`,
      renovaciones: sql<number>`count(*) filter (where ${t.contratos.tipoAccion} = 'RENOVACION')::int`,
      facturado: sql<string>`coalesce(sum(${t.ordenItems.totalProrrateado}), 0)::text`,
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
    .innerJoin(t.ordenItems, eq(t.ordenItems.contratoId, t.contratos.id))
    .where(and(gte(t.ordenes.emitidaEn, desde), ne(t.ordenes.estado, "CANCELADA")))
    .groupBy(t.paquetes.nombre)
    .orderBy(desc(sql`sum(${t.ordenItems.totalProrrateado})`));
  return filas.map((f) => ({ ...f, facturado: centavos(f.facturado) }));
}

// ─── Soporte ─────────────────────────────────────────────────────────────────

export async function incidentesPorEstado(db: Ejecutor) {
  return db
    .select({ estado: t.incidentes.estado, cantidad: sql<number>`count(*)::int` })
    .from(t.incidentes)
    .groupBy(t.incidentes.estado);
}

// ─── Portal ──────────────────────────────────────────────────────────────────

/** Historial de consumos de una empresa, lo más reciente primero. */
/** Consumos de la empresa (un delegado ve los de sus oficinas). */
export async function consumosDeEmpresa(
  db: Ejecutor,
  empresaId: string,
  limite = 500,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  return db
    .select({
      id: t.consumos.id,
      registradoEn: t.consumos.registradoEn,
      familia: t.consumos.familia,
      sistema: t.consumos.sistema,
      medio: t.consumos.medioEnvioId,
      cantidad: t.consumos.cantidad,
      solicitados: t.consumos.creditosSolicitados,
      consumidos: t.consumos.creditosConsumidos,
      concepto: t.consumos.concepto,
      oficina: sql<
        string | null
      >`(select c.codigo || '-' || o.codigo from ${t.oficinas} o join ${t.canales} c on c.id = o.canal_id where o.id = "consumos"."oficina_id")`,
    })
    .from(t.consumos)
    .where(
      and(eq(t.consumos.empresaId, empresaId), oficinaEnAlcance(t.consumos.oficinaId, alcance)),
    )
    .orderBy(desc(t.consumos.registradoEn))
    .limit(limite);
}
