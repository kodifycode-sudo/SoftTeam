import { type Column, eq, type SQL, sql } from "drizzle-orm";
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

/** Condición SQL para los colaboradores (guardan canal y oficina). */
export function colaboradorEnAlcance(alcance: Alcance): SQL | undefined {
  switch (alcance.tipo) {
    case "empresa":
      return undefined;
    case "canal":
      return eq(t.colaboradores.canalId, alcance.canalId);
    case "oficina":
      return eq(t.colaboradores.oficinaId, alcance.oficinaId);
  }
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
