import { and, desc, eq, sql } from "drizzle-orm";
import type { Rango } from "@/domain/reportes/periodos";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { clienteEnFiltro, enRango, type FiltroCuentas } from "./reportes";

/**
 * Cómo llegó el cliente: registro en línea (solicitud de alta confirmada),
 * alta hecha por SOFTeam desde el panel, o importado (migración desde
 * SOFTeam o carga inicial).
 */
export type OrigenAlta = "EN_LINEA" | "SOFTEAM" | "IMPORTACION";

export const ORIGENES_ALTA: readonly OrigenAlta[] = ["EN_LINEA", "SOFTEAM", "IMPORTACION"];

const origen = sql<OrigenAlta>`case
  when exists (select 1 from ${t.solicitudesAlta} s where s.cliente_id = ${t.clientes.id}) then 'EN_LINEA'
  when exists (select 1 from ${t.auditoria} a where a.entidad = 'cliente' and a.accion = 'alta' and a.entidad_id = ${t.clientes.id}::text) then 'SOFTEAM'
  else 'IMPORTACION' end`;

/** Clientes dados de alta en el rango, del más nuevo al más viejo, con su origen. */
export async function altasDeClientes(db: Ejecutor, rango: Rango, filtro: FiltroCuentas = {}) {
  return db
    .select({
      id: t.clientes.id,
      numero: t.clientes.numero,
      nombre: t.clientes.nombre,
      cuit: t.clientes.cuit,
      creadoEn: t.clientes.creadoEn,
      mes: sql<string>`to_char(${t.clientes.creadoEn} - interval '3 hours', 'YYYY-MM')`,
      origen,
      grupo: t.gruposEconomicos.nombre,
      paises: sql<string>`coalesce((select string_agg(distinct p.nombre, ', ') from ${t.empresas} e join ${t.paises} p on p.id = e.pais_id where e.cliente_id = ${t.clientes.id}), '')`,
      empresas: sql<number>`(select count(*)::int from ${t.empresas} e where e.cliente_id = ${t.clientes.id})`,
    })
    .from(t.clientes)
    .leftJoin(t.gruposEconomicos, eq(t.gruposEconomicos.id, t.clientes.grupoId))
    .where(and(enRango(t.clientes.creadoEn, rango), clienteEnFiltro(t.clientes.id, filtro)))
    .orderBy(desc(t.clientes.creadoEn));
}

export type AltaDeCliente = Awaited<ReturnType<typeof altasDeClientes>>[number];

/** Altas por mes y origen, con todos los meses de la lista (aunque no haya altas). */
export function altasPorMes(meses: readonly string[], altas: readonly AltaDeCliente[]) {
  return meses.map((mes) => {
    const delMes = altas.filter((a) => a.mes === mes);
    const porOrigen = Object.fromEntries(
      ORIGENES_ALTA.map((o) => [o, delMes.filter((a) => a.origen === o).length]),
    ) as Record<OrigenAlta, number>;
    return { mes, total: delMes.length, ...porOrigen };
  });
}
