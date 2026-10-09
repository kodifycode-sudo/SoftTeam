import { and, asc, count, desc, eq, ilike, inArray, or, sql, sum } from "drizzle-orm";
import type { Fecha } from "@/domain/fecha";
import type { Orden, Pagina } from "@/lib/listados";
import type { Ejecutor } from "@/server/db/cliente";
import { ordenarPor, paginar, totalFiltrado } from "@/server/db/listados";
import * as t from "@/server/db/schema";

const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

export const COLUMNAS_CLIENTES = ["numero", "nombre", "empresas", "alta"] as const;
export type ColumnaClientes = (typeof COLUMNAS_CLIENTES)[number];

export interface FiltrosClientes {
  busqueda?: string;
  inactivos?: boolean;
  /** Sin página, devuelve todos (exportación). */
  pagina?: Pagina;
  orden?: Orden<ColumnaClientes>;
}

export async function listarClientes(db: Ejecutor, filtros: FiltrosClientes = {}) {
  const busqueda = filtros.busqueda?.trim();
  const patron = busqueda ? `%${escaparLike(busqueda)}%` : undefined;
  const digitos = busqueda?.replace(/\D/g, "");
  const empresas = sql<number>`(select count(*)::int from ${t.empresas} e where e.cliente_id = ${t.clientes.id})`;
  const columnasOrden = {
    numero: t.clientes.numero,
    nombre: sql`lower(${t.clientes.nombre})`,
    empresas,
    alta: t.clientes.creadoEn,
  };

  const consulta = db
    .select({
      id: t.clientes.id,
      numero: t.clientes.numero,
      nombre: t.clientes.nombre,
      cuit: t.clientes.cuit,
      condicionIva: t.clientes.condicionIva,
      condicionIvaNombre: t.condicionesIva.nombre,
      activo: t.clientes.activo,
      creadoEn: t.clientes.creadoEn,
      grupo: t.gruposEconomicos.nombreCorto,
      administrador: sql<string>`${t.clientes.contactoAdministrador}->>'nombre'`,
      email: sql<string>`${t.clientes.contactoAdministrador}->>'email'`,
      empresas,
      modoFacturacion: t.clientes.modoFacturacion,
      totalFilas: totalFiltrado(),
    })
    .from(t.clientes)
    .leftJoin(t.gruposEconomicos, eq(t.gruposEconomicos.id, t.clientes.grupoId))
    .innerJoin(t.condicionesIva, eq(t.condicionesIva.codigo, t.clientes.condicionIva))
    .where(
      and(
        filtros.inactivos ? undefined : eq(t.clientes.activo, true),
        patron
          ? or(
              ilike(t.clientes.nombre, patron),
              ilike(sql`${t.clientes.contactoAdministrador}->>'email'`, patron),
              digitos && digitos.length >= 3 ? ilike(t.clientes.cuit, `%${digitos}%`) : undefined,
              /^\d+$/.test(busqueda ?? "") ? eq(t.clientes.numero, Number(busqueda)) : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(
      ...ordenarPor(
        columnasOrden,
        filtros.orden ?? { columna: "alta", direccion: "desc" },
        t.clientes.numero,
      ),
    )
    .$dynamic();
  return paginar(consulta, filtros.pagina);
}

export async function obtenerCliente(db: Ejecutor, clienteId: string) {
  const cliente = await db.query.clientes.findFirst({ where: eq(t.clientes.id, clienteId) });
  if (!cliente) return undefined;

  const [grupo, empresas, condicion] = await Promise.all([
    cliente.grupoId
      ? db.query.gruposEconomicos.findFirst({ where: eq(t.gruposEconomicos.id, cliente.grupoId) })
      : undefined,
    db
      .select()
      .from(t.empresas)
      .where(eq(t.empresas.clienteId, clienteId))
      .orderBy(asc(t.empresas.numero)),
    db.query.condicionesIva.findFirst({
      columns: { nombre: true },
      where: eq(t.condicionesIva.codigo, cliente.condicionIva),
    }),
  ]);

  const idsEmpresas = empresas.map((e) => e.id);
  const [oficinas, colaboradores] = idsEmpresas.length
    ? await Promise.all([
        db
          .select({ empresaId: t.oficinas.empresaId, total: count() })
          .from(t.oficinas)
          .where(inArray(t.oficinas.empresaId, idsEmpresas))
          .groupBy(t.oficinas.empresaId),
        db
          .select({ empresaId: t.colaboradores.empresaId, total: count() })
          .from(t.colaboradores)
          .where(
            and(inArray(t.colaboradores.empresaId, idsEmpresas), eq(t.colaboradores.activo, true)),
          )
          .groupBy(t.colaboradores.empresaId),
      ])
    : [[], []];

  const contar = (filas: { empresaId: string; total: number }[], id: string) =>
    filas.find((f) => f.empresaId === id)?.total ?? 0;

  return {
    ...cliente,
    condicionIvaNombre: condicion?.nombre ?? cliente.condicionIva,
    grupo,
    empresas: empresas.map((e) => ({
      ...e,
      oficinas: contar(oficinas, e.id),
      colaboradores: contar(colaboradores, e.id),
    })),
  };
}

/** Indicadores del tablero de SOFTeam. */
export async function indicadoresTablero(db: Ejecutor, hoy: Fecha) {
  const [clientesActivos, empresasActivas, contratosVigentes, ordenesPendientes, ultimosClientes] =
    await Promise.all([
      db.select({ total: count() }).from(t.clientes).where(eq(t.clientes.activo, true)),
      db.select({ total: count() }).from(t.empresas).where(eq(t.empresas.activa, true)),
      db
        .select({ total: count() })
        .from(t.contratos)
        .where(
          and(
            inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
            or(sql`${t.contratos.hasta} is null`, sql`${t.contratos.hasta} >= ${hoy}`),
          ),
        ),
      db
        .select({ total: count(), importe: sum(t.ordenes.total) })
        .from(t.ordenes)
        .where(eq(t.ordenes.estado, "PEND_PAGO")),
      db
        .select({
          id: t.clientes.id,
          numero: t.clientes.numero,
          nombre: t.clientes.nombre,
          creadoEn: t.clientes.creadoEn,
        })
        .from(t.clientes)
        .orderBy(desc(t.clientes.creadoEn))
        .limit(6),
    ]);

  return {
    clientesActivos: clientesActivos[0]?.total ?? 0,
    empresasActivas: empresasActivas[0]?.total ?? 0,
    contratosVigentes: contratosVigentes[0]?.total ?? 0,
    ordenesPendientes: ordenesPendientes[0]?.total ?? 0,
    importePendiente: ordenesPendientes[0]?.importe ?? "0",
    ultimosClientes,
  };
}
