import { type Column, eq, or, type SQL, sql } from "drizzle-orm";
import type { Alcance } from "@/domain/cuentas/alcance";
import * as t from "@/server/db/schema";

/**
 * Condición SQL para una columna `oficina_id`: lo asignado a oficinas del
 * alcance. Con toda la empresa no filtra (`undefined`); lo que no tiene
 * oficina queda afuera de un alcance delegado.
 */
export function oficinaEnAlcance(columna: Column, alcance: Alcance): SQL | undefined {
  switch (alcance.tipo) {
    case "empresa":
      return undefined;
    case "oficina":
      return eq(columna, alcance.oficinaId);
    case "canal":
      return sql`${columna} in (select ${t.oficinas.id} from ${t.oficinas} where ${t.oficinas.canalId} = ${alcance.canalId})`;
  }
}

/**
 * Condición SQL para lo que guarda canal y oficina (colaboradores, pedidos de
 * soporte, avisos): lo del canal o de sus oficinas, o lo de la oficina.
 */
export function canalOficinaEnAlcance(
  canal: Column,
  oficina: Column,
  alcance: Alcance,
): SQL | undefined {
  switch (alcance.tipo) {
    case "empresa":
      return undefined;
    case "canal":
      return eq(canal, alcance.canalId);
    case "oficina":
      return eq(oficina, alcance.oficinaId);
  }
}

/** Condición SQL para los colaboradores. */
export const colaboradorEnAlcance = (alcance: Alcance) =>
  canalOficinaEnAlcance(t.colaboradores.canalId, t.colaboradores.oficinaId, alcance);

/**
 * Avisos visibles para un delegado: los de su canal u oficina, y los de
 * contratos u órdenes de sus oficinas. Los de toda la empresa (licencia
 * vencida, saldo de la empresa…) quedan para quien la administra entera.
 */
export function alertaEnAlcance(alcance: Alcance): SQL | undefined {
  const contratos = oficinaEnAlcance(t.contratos.oficinaId, alcance);
  if (!contratos) return undefined;
  return or(
    canalOficinaEnAlcance(t.alertas.canalId, t.alertas.oficinaId, alcance),
    sql`exists (select 1 from ${t.contratos} where ${t.contratos.id} = ${t.alertas.contratoId} and ${contratos})`,
    sql`exists (select 1 from ${t.contratos} where ${t.contratos.ordenId} = ${t.alertas.ordenId} and ${contratos})`,
  );
}

/**
 * Órdenes visibles: las que incluyen algún contrato de oficinas del alcance
 * (la compra delegada y sus renovaciones asignan la oficina al contrato).
 */
export function ordenEnAlcance(alcance: Alcance): SQL | undefined {
  const condicion = oficinaEnAlcance(t.contratos.oficinaId, alcance);
  if (!condicion) return undefined;
  return sql`exists (select 1 from ${t.contratos} where ${t.contratos.ordenId} = ${t.ordenes.id} and ${condicion})`;
}
