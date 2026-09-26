import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

export interface Registro {
  actorId: string | null;
  /** "usuario", "sistema", "api:prodigal"… Por defecto, "usuario". */
  actorTipo?: string;
  entidad: string;
  entidadId: string;
  accion: string;
  antes?: unknown;
  despues?: unknown;
  motivo?: string;
  /** Empresa afectada (para su histórico de actividad). */
  empresaId?: string | null;
}

/** Registra un cambio en la auditoría (dentro de la misma transacción que el cambio). */
export async function auditar(db: Ejecutor, r: Registro): Promise<void> {
  await db.insert(t.auditoria).values({
    actorId: r.actorId,
    actorTipo: r.actorTipo ?? "usuario",
    entidad: r.entidad,
    entidadId: r.entidadId,
    accion: r.accion,
    antes: r.antes ?? null,
    despues: r.despues ?? null,
    motivo: r.motivo ?? null,
    empresaId: r.empresaId ?? null,
  });
}

export const TAMANO_PAGINA_AUDITORIA = 50;

export interface FiltrosAuditoria {
  entidad?: string | undefined;
  /** Busca en el id de la entidad, la acción, el actor o el motivo. */
  texto?: string | undefined;
  /** Paginación por cursor: registros anteriores a este id. */
  antesDe?: number | undefined;
}

/** Registros más recientes primero, con el nombre del actor cuando es un usuario. */
export async function listarAuditoria(db: Ejecutor, filtros: FiltrosAuditoria) {
  const texto = filtros.texto?.trim();
  const patron = texto ? `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;
  const filas = await db
    .select({
      id: t.auditoria.id,
      en: t.auditoria.en,
      actorId: t.auditoria.actorId,
      actorTipo: t.auditoria.actorTipo,
      actorNombre: t.usuarios.name,
      actorEmail: t.usuarios.email,
      entidad: t.auditoria.entidad,
      entidadId: t.auditoria.entidadId,
      accion: t.auditoria.accion,
      antes: t.auditoria.antes,
      despues: t.auditoria.despues,
      motivo: t.auditoria.motivo,
    })
    .from(t.auditoria)
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.auditoria.actorId))
    .where(
      and(
        filtros.entidad ? eq(t.auditoria.entidad, filtros.entidad) : undefined,
        filtros.antesDe ? lt(t.auditoria.id, filtros.antesDe) : undefined,
        patron
          ? or(
              ilike(t.auditoria.entidadId, patron),
              ilike(t.auditoria.accion, patron),
              ilike(t.auditoria.motivo, patron),
              ilike(t.usuarios.name, patron),
              ilike(t.usuarios.email, patron),
              ilike(sql`${t.auditoria.despues}::text`, patron),
            )
          : undefined,
      ),
    )
    .orderBy(desc(t.auditoria.id))
    .limit(TAMANO_PAGINA_AUDITORIA + 1);
  return {
    registros: filas.slice(0, TAMANO_PAGINA_AUDITORIA),
    siguiente:
      filas.length > TAMANO_PAGINA_AUDITORIA ? filas[TAMANO_PAGINA_AUDITORIA - 1]?.id : undefined,
  };
}

/** Entidades que tienen registros (para el filtro). */
export async function entidadesAuditadas(db: Ejecutor): Promise<string[]> {
  const filas = await db
    .selectDistinct({ entidad: t.auditoria.entidad })
    .from(t.auditoria)
    .orderBy(t.auditoria.entidad);
  return filas.map((f) => f.entidad);
}
