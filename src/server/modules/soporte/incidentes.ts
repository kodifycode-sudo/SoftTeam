import { randomUUID } from "node:crypto";
import { aliasedTable, and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { consumir } from "../consumos/consumir";
import { licenciaDeEmpresa } from "../licencias/licencia-empresa";
import { registrarAlerta } from "../procesos/alertas";

export const PRODUCTOS_SOPORTE = {
  prodigal: "Prodigal",
  cotiweb: "CotiWeb",
  bienseguro: "BienSeguro",
  boletin: "Boletín C@",
  stlic: "STLic (licencias y pagos)",
  otro: "Otro",
} as const;

export type EstadoIncidente = (typeof t.incidentes.$inferSelect)["estado"];
export type PrioridadIncidente = (typeof t.incidentes.$inferSelect)["prioridad"];

/** Estados en los que el pedido sigue "abierto" para la bandeja y los contadores. */
export const ESTADOS_ABIERTOS: EstadoIncidente[] = ["ABIERTO", "EN_CURSO", "ESPERANDO_CLIENTE"];

// ─── Créditos ────────────────────────────────────────────────────────────────

export interface CreditosSoporte {
  mes: { total: number; disponible: number } | null;
  saldo: { total: number; disponible: number } | null;
  disponibles: number;
}

/** Tickets de soporte que la empresa puede abrir hoy (cupo del mes + saldo). */
export async function creditosDeSoporte(
  db: Ejecutor,
  empresaId: string,
  hoy: Fecha = hoyArgentina(),
): Promise<CreditosSoporte> {
  const licencia = await licenciaDeEmpresa(db, empresaId, hoy);
  const items = licencia.productos.find((p) => p.productoId === "soporte")?.items ?? [];
  const leer = (id: string) => {
    const i = items.find((x) => x.recursoId === id);
    return i ? { total: i.total, disponible: i.disponible ?? 0 } : null;
  };
  const mes = leer("soporte.mes");
  const saldo = leer("soporte.saldo");
  return { mes, saldo, disponibles: (mes?.disponible ?? 0) + (saldo?.disponible ?? 0) };
}

// ─── Abrir ───────────────────────────────────────────────────────────────────

export const esquemaIncidente = z.object({
  producto: z.enum(Object.keys(PRODUCTOS_SOPORTE) as [keyof typeof PRODUCTOS_SOPORTE]),
  asunto: z.string().trim().min(5, { error: "Contá en pocas palabras de qué se trata" }).max(140),
  prioridad: z.enum(["BAJA", "MEDIA", "ALTA"]),
  texto: z
    .string()
    .trim()
    .min(10, { error: "Describí el problema con un poco más de detalle" })
    .max(5000),
});

export type EntradaIncidente = z.infer<typeof esquemaIncidente>;

/** Para deshacer la transacción cuando no hay crédito. */
class SinCreditos extends Error {}

export type ErrorAbrir = "SIN_CREDITOS" | "EMPRESA_INACTIVA";

/**
 * Abre un pedido de soporte y consume un crédito (primero el cupo del mes,
 * después el saldo), todo en una transacción: sin crédito no hay pedido, y
 * un pedido nunca queda sin su crédito descontado.
 */
export async function abrirIncidente(
  db: Db,
  contexto: { empresaId: string; empresaNumero: number; usuarioId: string },
  entrada: EntradaIncidente,
  hoy: Fecha = hoyArgentina(),
): Promise<{ ok: true; id: string; numero: number } | { ok: false; error: ErrorAbrir }> {
  const id = randomUUID();
  try {
    return await db.transaction(async (tx) => {
      const consumo = await consumir(
        tx,
        {
          sistema: "stlic",
          empresaNumero: contexto.empresaNumero,
          familia: "soporte",
          cantidad: 1,
          modo: "TODO_O_NADA",
          transaccion: `incidente:${id}`,
          concepto: entrada.asunto.slice(0, 200),
        },
        hoy,
      );
      if (!consumo.ok) {
        if (consumo.error === "EMPRESA_INACTIVA")
          return { ok: false as const, error: "EMPRESA_INACTIVA" as const };
        throw new Error(consumo.error);
      }
      if (!consumo.valor.completo) throw new SinCreditos();
      const registro = await tx.query.consumos.findFirst({
        columns: { id: true },
        where: and(
          eq(t.consumos.sistema, "stlic"),
          eq(t.consumos.transaccionExterna, `incidente:${id}`),
        ),
      });

      const [incidente] = await tx
        .insert(t.incidentes)
        .values({
          id,
          empresaId: contexto.empresaId,
          creadoPorId: contexto.usuarioId,
          producto: entrada.producto,
          asunto: entrada.asunto,
          prioridad: entrada.prioridad,
          consumoId: registro?.id ?? null,
        })
        .returning({ numero: t.incidentes.numero });
      await tx.insert(t.incidenteMensajes).values({
        incidenteId: id,
        autorId: contexto.usuarioId,
        deSofteam: false,
        texto: entrada.texto,
      });
      await auditar(tx, {
        actorId: contexto.usuarioId,
        entidad: "incidente",
        entidadId: id,
        accion: "alta",
        empresaId: contexto.empresaId,
        despues: {
          numero: incidente?.numero,
          asunto: entrada.asunto,
          prioridad: entrada.prioridad,
        },
      });
      return { ok: true as const, id, numero: incidente?.numero ?? 0 };
    });
  } catch (e) {
    if (e instanceof SinCreditos) return { ok: false, error: "SIN_CREDITOS" };
    throw e;
  }
}

// ─── Consultas ───────────────────────────────────────────────────────────────

const asignado = aliasedTable(t.usuarios, "asignado");

const columnasListado = {
  id: t.incidentes.id,
  numero: t.incidentes.numero,
  asunto: t.incidentes.asunto,
  producto: t.incidentes.producto,
  prioridad: t.incidentes.prioridad,
  estado: t.incidentes.estado,
  ultimaActividadEn: t.incidentes.ultimaActividadEn,
  creadoEn: t.incidentes.creadoEn,
  empresaId: t.incidentes.empresaId,
  empresa: t.empresas.nombre,
  empresaNumero: t.empresas.numero,
  asignadoA: asignado.name,
  mensajes: sql<number>`(select count(*)::int from ${t.incidenteMensajes} m where m.incidente_id = "incidentes"."id" and not m.interno)`,
  /** El último mensaje visible es del cliente: le toca responder a SOFTeam. */
  esperaSofteam: sql<boolean>`coalesce((select not m.de_softeam from ${t.incidenteMensajes} m where m.incidente_id = "incidentes"."id" and not m.interno order by m.creado_en desc limit 1), true)`,
};

export async function incidentesDeEmpresa(db: Ejecutor, empresaId: string) {
  return db
    .select(columnasListado)
    .from(t.incidentes)
    .innerJoin(t.empresas, eq(t.empresas.id, t.incidentes.empresaId))
    .leftJoin(asignado, eq(asignado.id, t.incidentes.asignadoAId))
    .where(eq(t.incidentes.empresaId, empresaId))
    .orderBy(desc(t.incidentes.ultimaActividadEn))
    .limit(200);
}

export interface FiltrosBandeja {
  estado?: EstadoIncidente | "ABIERTOS" | undefined;
  asignadoAId?: string | "SIN_ASIGNAR" | undefined;
  texto?: string | undefined;
}

/** Bandeja de Soporte: por defecto, los abiertos, los más urgentes y antiguos primero. */
export async function bandejaDeSoporte(db: Ejecutor, filtros: FiltrosBandeja) {
  const texto = filtros.texto?.trim();
  const patron = texto ? `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : undefined;
  const estado = filtros.estado ?? "ABIERTOS";
  return db
    .select(columnasListado)
    .from(t.incidentes)
    .innerJoin(t.empresas, eq(t.empresas.id, t.incidentes.empresaId))
    .leftJoin(asignado, eq(asignado.id, t.incidentes.asignadoAId))
    .where(
      and(
        estado === "ABIERTOS"
          ? inArray(t.incidentes.estado, ESTADOS_ABIERTOS)
          : eq(t.incidentes.estado, estado),
        filtros.asignadoAId === "SIN_ASIGNAR"
          ? sql`${t.incidentes.asignadoAId} is null`
          : filtros.asignadoAId
            ? eq(t.incidentes.asignadoAId, filtros.asignadoAId)
            : undefined,
        patron
          ? or(
              ilike(t.incidentes.asunto, patron),
              ilike(t.empresas.nombre, patron),
              /^\d+$/.test(texto ?? "") ? eq(t.incidentes.numero, Number(texto)) : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(
      sql`case ${t.incidentes.prioridad} when 'ALTA' then 0 when 'MEDIA' then 1 else 2 end`,
      asc(t.incidentes.ultimaActividadEn),
    )
    .limit(200);
}

export type IncidenteListado = Awaited<ReturnType<typeof bandejaDeSoporte>>[number];

/** Pedidos abiertos por empresa (para el panel de clientes). */
export async function abiertosPorEmpresa(db: Ejecutor, empresaIds: string[]) {
  if (empresaIds.length === 0) return new Map<string, number>();
  const filas = await db
    .select({ empresaId: t.incidentes.empresaId, cantidad: count() })
    .from(t.incidentes)
    .where(
      and(
        inArray(t.incidentes.empresaId, empresaIds),
        inArray(t.incidentes.estado, ESTADOS_ABIERTOS),
      ),
    )
    .groupBy(t.incidentes.empresaId);
  return new Map(filas.map((f) => [f.empresaId, f.cantidad]));
}

/**
 * Un pedido con su conversación. `empresaId` acota al cliente (un pedido
 * ajeno no existe para él) y oculta las notas internas de SOFTeam.
 */
export async function obtenerIncidente(db: Ejecutor, id: string, alcance: { empresaId?: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [incidente] = await db
    .select({
      ...columnasListado,
      asignadoAId: t.incidentes.asignadoAId,
      resueltoEn: t.incidentes.resueltoEn,
      // Subconsulta y no un segundo alias de usuarios: con dos alias de la
      // misma tabla, Drizzle no infiere el tipo del resultado.
      creadoPor: sql<string>`(select u.name from ${t.usuarios} u where u.id = "incidentes"."creado_por_id")`,
    })
    .from(t.incidentes)
    .innerJoin(t.empresas, eq(t.empresas.id, t.incidentes.empresaId))
    .leftJoin(asignado, eq(asignado.id, t.incidentes.asignadoAId))
    .where(
      and(
        eq(t.incidentes.id, id),
        alcance.empresaId ? eq(t.incidentes.empresaId, alcance.empresaId) : undefined,
      ),
    );
  if (!incidente) return undefined;
  const mensajes = await db
    .select({
      id: t.incidenteMensajes.id,
      texto: t.incidenteMensajes.texto,
      deSofteam: t.incidenteMensajes.deSofteam,
      interno: t.incidenteMensajes.interno,
      creadoEn: t.incidenteMensajes.creadoEn,
      autor: t.usuarios.name,
    })
    .from(t.incidenteMensajes)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.incidenteMensajes.autorId))
    .where(
      and(
        eq(t.incidenteMensajes.incidenteId, id),
        alcance.empresaId ? eq(t.incidenteMensajes.interno, false) : undefined,
      ),
    )
    .orderBy(asc(t.incidenteMensajes.creadoEn));
  return { ...incidente, mensajes };
}

export type DetalleIncidente = NonNullable<Awaited<ReturnType<typeof obtenerIncidente>>>;

// ─── Cambios ─────────────────────────────────────────────────────────────────

export type ErrorIncidente = "NO_EXISTE" | "CERRADO";

export interface Autor {
  usuarioId: string;
  /** Soporte SOFTeam (si no, es un usuario del cliente y se acota a su empresa). */
  softeam: boolean;
  empresaId?: string;
}

async function cargarParaCambiar(tx: Ejecutor, id: string, autor: Autor) {
  const [fila] = await tx
    .select()
    .from(t.incidentes)
    .where(
      and(
        eq(t.incidentes.id, id),
        autor.softeam ? undefined : eq(t.incidentes.empresaId, autor.empresaId ?? ""),
      ),
    )
    .for("update");
  return fila;
}

/**
 * Agrega un mensaje. La respuesta de SOFTeam deja el pedido esperando al
 * cliente y le avisa; la del cliente lo vuelve a poner en curso (también
 * reabre uno resuelto). Una nota interna no cambia el estado ni avisa.
 */
export async function responderIncidente(
  db: Db,
  id: string,
  autor: Autor,
  mensaje: { texto: string; interno?: boolean },
): Promise<{ ok: true } | { ok: false; error: ErrorIncidente }> {
  return db.transaction(async (tx) => {
    const incidente = await cargarParaCambiar(tx, id, autor);
    if (!incidente) return { ok: false, error: "NO_EXISTE" };
    if (incidente.estado === "CERRADO") return { ok: false, error: "CERRADO" };
    const interno = autor.softeam && Boolean(mensaje.interno);

    await tx.insert(t.incidenteMensajes).values({
      incidenteId: id,
      autorId: autor.usuarioId,
      deSofteam: autor.softeam,
      interno,
      texto: mensaje.texto,
    });
    if (!interno) {
      const estado: EstadoIncidente = autor.softeam ? "ESPERANDO_CLIENTE" : "EN_CURSO";
      await tx
        .update(t.incidentes)
        .set({
          estado,
          ultimaActividadEn: new Date(),
          resueltoEn: null,
          // Quien responde primero desde Soporte lo toma.
          ...(autor.softeam && !incidente.asignadoAId ? { asignadoAId: autor.usuarioId } : {}),
        })
        .where(eq(t.incidentes.id, id));
      if (autor.softeam) {
        await registrarAlerta(tx, {
          tipo: "SOPORTE_RESPUESTA",
          clave: `SOPORTE_RESPUESTA:${id}:${Date.now()}`,
          mensaje: `Soporte respondió tu consulta #${incidente.numero}: "${incidente.asunto}".`,
          empresaId: incidente.empresaId,
          paraSofteam: false,
        });
      }
    }
    return { ok: true };
  });
}

/**
 * Cambia el estado. SOFTeam puede llevarlo a cualquier estado; el cliente
 * solo puede cerrarlo (o reabrir uno resuelto, respondiendo).
 */
export async function cambiarEstadoIncidente(
  db: Db,
  id: string,
  autor: Autor,
  estado: EstadoIncidente,
): Promise<{ ok: true } | { ok: false; error: ErrorIncidente | "SIN_PERMISO" }> {
  if (!autor.softeam && estado !== "CERRADO") return { ok: false, error: "SIN_PERMISO" };
  return db.transaction(async (tx) => {
    const incidente = await cargarParaCambiar(tx, id, autor);
    if (!incidente) return { ok: false, error: "NO_EXISTE" };
    if (incidente.estado === estado) return { ok: true };
    await tx
      .update(t.incidentes)
      .set({
        estado,
        ultimaActividadEn: new Date(),
        resueltoEn: estado === "RESUELTO" ? new Date() : incidente.resueltoEn,
      })
      .where(eq(t.incidentes.id, id));
    await auditar(tx, {
      actorId: autor.usuarioId,
      entidad: "incidente",
      entidadId: id,
      accion: `estado_${estado.toLowerCase()}`,
      empresaId: incidente.empresaId,
      antes: { estado: incidente.estado },
      despues: { estado },
    });
    return { ok: true };
  });
}

/** Asigna el pedido a una persona de SOFTeam (o lo libera con `null`). */
export async function asignarIncidente(
  db: Db,
  id: string,
  usuarioId: string | null,
  actorId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (usuarioId) {
      const esSofteam = await tx.query.usuarios.findFirst({
        columns: { rolSofteam: true },
        where: eq(t.usuarios.id, usuarioId),
      });
      if (!esSofteam?.rolSofteam) return false;
    }
    const [actualizado] = await tx
      .update(t.incidentes)
      .set({ asignadoAId: usuarioId })
      .where(eq(t.incidentes.id, id))
      .returning({ empresaId: t.incidentes.empresaId });
    if (!actualizado) return false;
    await auditar(tx, {
      actorId,
      entidad: "incidente",
      entidadId: id,
      accion: "asignar",
      empresaId: actualizado.empresaId,
      despues: { asignadoAId: usuarioId },
    });
    return true;
  });
}
