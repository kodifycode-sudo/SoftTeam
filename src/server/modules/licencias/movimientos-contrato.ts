import { asc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

export interface MovimientoContrato {
  id: number;
  registradoEn: Date;
  recurso: string;
  unidad: string | null;
  tipo: "CARGA" | "CONSUMO" | "AJUSTE" | "REINTEGRO";
  creditos: number;
  /** Mes "AAAA-MM" de un cupo mensual; `null` para un saldo. */
  periodo: string | null;
  observacion: string | null;
  /** Saldo del recurso (y del mes, si es un cupo) después del movimiento. */
  saldo: number;
}

/**
 * Un contrato con su libro de movimientos de saldo (cargas, consumos y
 * ajustes), del más reciente al más antiguo, con el saldo después de cada uno
 * y el saldo actual por recurso. Solo lectura: el libro es inmutable.
 */
export async function obtenerMovimientosContrato(db: Db, contratoId: string) {
  const [contrato] = await db
    .select({
      id: t.contratos.id,
      estado: t.contratos.estado,
      cantidad: t.contratos.cantidad,
      desde: t.contratos.desde,
      hasta: t.contratos.hasta,
      paquete: t.paquetes.nombre,
      alternativa: t.alternativas.nombre,
      empresaId: t.empresas.id,
      empresa: t.empresas.nombre,
      empresaNumero: t.empresas.numero,
      clienteId: t.empresas.clienteId,
      ordenId: t.ordenes.id,
      ordenNumero: t.ordenes.numero,
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.alternativas, eq(t.alternativas.id, t.contratos.alternativaId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
    .where(eq(t.contratos.id, contratoId));
  if (!contrato) return null;

  const filas = await db
    .select({
      id: t.movimientosSaldo.id,
      registradoEn: t.movimientosSaldo.registradoEn,
      recursoId: t.movimientosSaldo.recursoId,
      recurso: t.recursos.nombre,
      unidad: t.recursos.unidad,
      tipo: t.movimientosSaldo.tipo,
      creditos: t.movimientosSaldo.creditos,
      periodo: t.movimientosSaldo.periodo,
      observacion: t.movimientosSaldo.observacion,
    })
    .from(t.movimientosSaldo)
    .innerJoin(t.recursos, eq(t.recursos.id, t.movimientosSaldo.recursoId))
    .where(eq(t.movimientosSaldo.contratoId, contratoId))
    .orderBy(asc(t.movimientosSaldo.id));

  // Saldo por recurso y mes, y el actual: el del último mes de cada recurso.
  const acumulado = new Map<string, number>();
  const saldos = new Map<
    string,
    { recurso: string; unidad: string | null; periodo: string | null; saldo: number }
  >();
  const movimientos: MovimientoContrato[] = filas.map(({ recursoId, ...m }) => {
    const clave = `${recursoId}|${m.periodo ?? ""}`;
    const saldo = (acumulado.get(clave) ?? 0) + m.creditos;
    acumulado.set(clave, saldo);
    const previo = saldos.get(recursoId);
    if (!previo || (m.periodo ?? "") >= (previo.periodo ?? "")) {
      saldos.set(recursoId, { recurso: m.recurso, unidad: m.unidad, periodo: m.periodo, saldo });
    }
    return { ...m, saldo };
  });

  return { contrato, movimientos: movimientos.reverse(), saldos: [...saldos.values()] };
}
