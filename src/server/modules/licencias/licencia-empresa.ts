import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { estaVigente } from "@/domain/licencias/contrato";
import { type ClaseRecurso, consolidarLicencia } from "@/domain/licencias/licencia";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

export interface ItemLicencia {
  recursoId: string;
  nombre: string;
  unidad: string | null;
  clase: ClaseRecurso;
  /** Total licenciado (para FUNCION: 1 habilitada). */
  total: number;
  /** Para CUPO_MENSUAL y SALDO: créditos disponibles hoy. */
  disponible: number | null;
}

export interface ProductoLicencia {
  productoId: string;
  nombre: string;
  items: ItemLicencia[];
}

export interface ContratoVigenteResumen {
  id: string;
  paquete: string;
  estado: "ACTIVO" | "PEND_PAGO_ACTIVO";
  tipoPaquete: "TEMPORAL" | "CONSUMIBLE";
  hasta: Fecha | null;
  cantidad: number;
}

export interface LicenciaEmpresa {
  productos: ProductoLicencia[];
  contratosVigentes: ContratoVigenteResumen[];
}

/**
 * Licencia vigente de una empresa a una fecha: suma de los contratos vigentes
 * (reglas de `domain/licencias`), con el disponible de cupos y saldos.
 */
export async function licenciaDeEmpresa(
  db: Ejecutor,
  empresaId: string,
  hoy: Fecha = hoyArgentina(),
): Promise<LicenciaEmpresa> {
  const contratos = await db
    .select({
      id: t.contratos.id,
      estado: t.contratos.estado,
      tipoPaquete: t.contratos.tipoPaquete,
      desde: t.contratos.desde,
      hasta: t.contratos.hasta,
      pendPagoActivoHasta: t.contratos.pendPagoActivoHasta,
      cantidad: t.contratos.cantidad,
      paquete: t.paquetes.nombre,
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .where(
      and(
        eq(t.contratos.empresaId, empresaId),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
      ),
    )
    .orderBy(asc(t.contratos.hasta));

  if (contratos.length === 0) return { productos: [], contratosVigentes: [] };
  const ids = contratos.map((c) => c.id);

  const [recursos, saldos, consumosDelMes] = await Promise.all([
    db
      .select({
        contratoId: t.contratoRecursos.contratoId,
        recursoId: t.contratoRecursos.recursoId,
        clase: t.contratoRecursos.clase,
        cantidad: t.contratoRecursos.cantidad,
      })
      .from(t.contratoRecursos)
      .where(inArray(t.contratoRecursos.contratoId, ids)),
    // Saldo prepago: suma de todos sus movimientos.
    db
      .select({
        contratoId: t.movimientosSaldo.contratoId,
        recursoId: t.movimientosSaldo.recursoId,
        saldo: sql<number>`coalesce(sum(${t.movimientosSaldo.creditos}), 0)::int`,
      })
      .from(t.movimientosSaldo)
      .where(
        and(inArray(t.movimientosSaldo.contratoId, ids), eq(t.movimientosSaldo.clase, "SALDO")),
      )
      .groupBy(t.movimientosSaldo.contratoId, t.movimientosSaldo.recursoId),
    // Cupo mensual: lo consumido en el mes en curso (el cupo se renueva solo).
    db
      .select({
        contratoId: t.movimientosSaldo.contratoId,
        recursoId: t.movimientosSaldo.recursoId,
        consumido: sql<number>`coalesce(-sum(${t.movimientosSaldo.creditos}), 0)::int`,
      })
      .from(t.movimientosSaldo)
      .where(
        and(
          inArray(t.movimientosSaldo.contratoId, ids),
          eq(t.movimientosSaldo.clase, "CUPO_MENSUAL"),
          eq(t.movimientosSaldo.periodo, hoy.slice(0, 7)),
        ),
      )
      .groupBy(t.movimientosSaldo.contratoId, t.movimientosSaldo.recursoId),
  ]);

  const clave = (contratoId: string, recursoId: string) => `${contratoId}|${recursoId}`;
  const saldoPor = new Map(saldos.map((s) => [clave(s.contratoId, s.recursoId), Number(s.saldo)]));
  const consumidoPor = new Map(
    consumosDelMes.map((c) => [clave(c.contratoId, c.recursoId), Number(c.consumido)]),
  );

  const vigentes = contratos.filter((c) => {
    const saldoRestante = recursos
      .filter((r) => r.contratoId === c.id && r.clase === "SALDO")
      .reduce((total, r) => total + (saldoPor.get(clave(c.id, r.recursoId)) ?? 0), 0);
    return estaVigente({ ...c, saldoRestante }, hoy);
  });
  const idsVigentes = new Set(vigentes.map((c) => c.id));
  const recursosVigentes = recursos.filter((r) => idsVigentes.has(r.contratoId));

  const licencia = consolidarLicencia(
    vigentes.map((c) =>
      recursosVigentes
        .filter((r) => r.contratoId === c.id)
        .map((r) => ({ recurso: r.recursoId, clase: r.clase, cantidad: r.cantidad })),
    ),
  );

  const disponible = new Map<string, number>();
  for (const r of recursosVigentes) {
    const k = clave(r.contratoId, r.recursoId);
    const valor =
      r.clase === "SALDO"
        ? (saldoPor.get(k) ?? 0)
        : r.clase === "CUPO_MENSUAL"
          ? Math.max(r.cantidad - (consumidoPor.get(k) ?? 0), 0)
          : null;
    if (valor !== null) disponible.set(r.recursoId, (disponible.get(r.recursoId) ?? 0) + valor);
  }

  const catalogo = await db
    .select({
      recursoId: t.recursos.id,
      nombre: t.recursos.nombre,
      unidad: t.recursos.unidad,
      orden: t.recursos.orden,
      productoId: t.productos.id,
      producto: t.productos.nombre,
      ordenProducto: t.productos.orden,
    })
    .from(t.recursos)
    .innerJoin(t.productos, eq(t.productos.id, t.recursos.productoId))
    .where(inArray(t.recursos.id, [...licencia.keys()]))
    .orderBy(asc(t.productos.orden), asc(t.recursos.orden));

  const productos = new Map<string, ProductoLicencia>();
  for (const r of catalogo) {
    const valor = licencia.get(r.recursoId);
    if (!valor) continue;
    const producto = productos.get(r.productoId) ?? {
      productoId: r.productoId,
      nombre: r.producto,
      items: [],
    };
    producto.items.push({
      recursoId: r.recursoId,
      nombre: r.nombre,
      unidad: r.unidad,
      clase: valor.clase,
      total: valor.total,
      disponible: disponible.get(r.recursoId) ?? null,
    });
    productos.set(r.productoId, producto);
  }

  return {
    productos: [...productos.values()].filter((p) => p.items.some((i) => i.total > 0)),
    contratosVigentes: vigentes.map((c) => ({
      id: c.id,
      paquete: c.paquete,
      estado: c.estado as "ACTIVO" | "PEND_PAGO_ACTIVO",
      tipoPaquete: c.tipoPaquete,
      hasta: c.hasta,
      cantidad: c.cantidad,
    })),
  };
}
