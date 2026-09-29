import { aliasedTable, and, asc, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizarCuit } from "@/domain/cuentas/cuit";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/*
 * Grupos económicos: organizan clientes (reportes, "cliente principal") y,
 * con un cliente de facturación, permiten la facturación consolidada por
 * planilla. Los administra SOFTeam.
 */

/** Cliente por CUIT (con o sin guiones) o por número de cliente. */
export async function buscarCliente(db: Ejecutor, texto: string) {
  const buscado = texto.replace(/[-\s.]/g, "");
  if (!/^\d{4,11}$/.test(buscado)) return undefined;
  return db.query.clientes.findFirst({
    columns: { id: true, nombre: true, activo: true, grupoId: true },
    where:
      buscado.length === 11
        ? eq(t.clientes.cuit, normalizarCuit(buscado))
        : eq(t.clientes.numero, Number(buscado)),
  });
}

const principal = aliasedTable(t.clientes, "principal");
const facturacion = aliasedTable(t.clientes, "facturacion");

export async function listarGrupos(db: Ejecutor) {
  return db
    .select({
      id: t.gruposEconomicos.id,
      nombre: t.gruposEconomicos.nombre,
      nombreCorto: t.gruposEconomicos.nombreCorto,
      principal: principal.nombre,
      facturacion: facturacion.nombreFactura,
      miembros: sql<number>`(select count(*)::int from ${t.clientes} c where c.grupo_id = "grupos_economicos"."id")`,
    })
    .from(t.gruposEconomicos)
    .leftJoin(principal, eq(principal.id, t.gruposEconomicos.clientePrincipalId))
    .leftJoin(facturacion, eq(facturacion.id, t.gruposEconomicos.clienteFacturacionId))
    .orderBy(asc(t.gruposEconomicos.nombre));
}

export async function obtenerGrupo(db: Ejecutor, id: string) {
  const grupo = await db.query.gruposEconomicos.findFirst({
    where: eq(t.gruposEconomicos.id, id),
  });
  if (!grupo) return undefined;
  const [miembros, principalFila, facturacionFila] = await Promise.all([
    db
      .select({
        id: t.clientes.id,
        numero: t.clientes.numero,
        nombre: t.clientes.nombre,
        cuit: t.clientes.cuit,
        activo: t.clientes.activo,
        empresas: count(t.empresas.id),
      })
      .from(t.clientes)
      .leftJoin(t.empresas, eq(t.empresas.clienteId, t.clientes.id))
      .where(eq(t.clientes.grupoId, id))
      .groupBy(t.clientes.id)
      .orderBy(asc(t.clientes.nombre)),
    grupo.clientePrincipalId
      ? db.query.clientes.findFirst({
          columns: { id: true, numero: true, nombre: true, cuit: true },
          where: eq(t.clientes.id, grupo.clientePrincipalId),
        })
      : undefined,
    grupo.clienteFacturacionId
      ? db.query.clientes.findFirst({
          columns: { id: true, numero: true, nombreFactura: true, cuit: true, activo: true },
          where: eq(t.clientes.id, grupo.clienteFacturacionId),
        })
      : undefined,
  ]);
  return { ...grupo, miembros, principal: principalFila, facturacion: facturacionFila };
}

export type DetalleGrupo = NonNullable<Awaited<ReturnType<typeof obtenerGrupo>>>;

export const esquemaGrupo = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre" }).max(80),
  nombreCorto: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9 _-]{2,20}$/, { error: "2 a 20 letras o números" }),
  /** CUIT o número de cliente; vacío: ninguno. */
  principal: z.string().trim().max(20).optional(),
  facturacion: z.string().trim().max(20).optional(),
});

export type EntradaGrupo = z.infer<typeof esquemaGrupo>;

export type ErrorGrupo =
  | "NO_EXISTE"
  | "NOMBRE_CORTO_EXISTENTE"
  | "PRINCIPAL_INEXISTENTE"
  | "FACTURACION_INEXISTENTE"
  | "FACTURACION_INACTIVA"
  | "CLIENTE_INEXISTENTE"
  | "EN_OTRO_GRUPO"
  | "CON_MIEMBROS";

/**
 * Alta o edición de un grupo. El cliente principal pasa a ser miembro. El
 * cliente de facturación puede no serlo (por ejemplo, la aseguradora que
 * paga las licencias de sus productores) y tiene que estar activo.
 */
export async function guardarGrupo(
  db: Db,
  entrada: EntradaGrupo,
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: ErrorGrupo }> {
  return db.transaction(async (tx) => {
    const antes = entrada.id
      ? await tx.query.gruposEconomicos.findFirst({ where: eq(t.gruposEconomicos.id, entrada.id) })
      : undefined;
    if (entrada.id && !antes) return { ok: false, error: "NO_EXISTE" };
    const repetido = await tx.query.gruposEconomicos.findFirst({
      columns: { id: true },
      where: and(
        eq(t.gruposEconomicos.nombreCorto, entrada.nombreCorto),
        antes ? ne(t.gruposEconomicos.id, antes.id) : undefined,
      ),
    });
    if (repetido) return { ok: false, error: "NOMBRE_CORTO_EXISTENTE" };

    const principalCliente = entrada.principal ? await buscarCliente(tx, entrada.principal) : null;
    if (entrada.principal && !principalCliente)
      return { ok: false, error: "PRINCIPAL_INEXISTENTE" };
    if (principalCliente?.grupoId && principalCliente.grupoId !== antes?.id) {
      return { ok: false, error: "EN_OTRO_GRUPO" };
    }
    const facturacionCliente = entrada.facturacion
      ? await buscarCliente(tx, entrada.facturacion)
      : null;
    if (entrada.facturacion && !facturacionCliente) {
      return { ok: false, error: "FACTURACION_INEXISTENTE" };
    }
    if (facturacionCliente && !facturacionCliente.activo) {
      return { ok: false, error: "FACTURACION_INACTIVA" };
    }

    const valores = {
      nombre: entrada.nombre,
      nombreCorto: entrada.nombreCorto,
      clientePrincipalId: principalCliente?.id ?? null,
      clienteFacturacionId: facturacionCliente?.id ?? null,
    };
    let id: string;
    if (antes) {
      await tx.update(t.gruposEconomicos).set(valores).where(eq(t.gruposEconomicos.id, antes.id));
      id = antes.id;
    } else {
      const [creado] = await tx
        .insert(t.gruposEconomicos)
        .values(valores)
        .returning({ id: t.gruposEconomicos.id });
      id = creado?.id ?? "";
    }
    if (principalCliente) {
      await tx
        .update(t.clientes)
        .set({ grupoId: id })
        .where(eq(t.clientes.id, principalCliente.id));
    }
    await auditar(tx, {
      actorId,
      entidad: "grupo",
      entidadId: id,
      accion: antes ? "modificacion" : "alta",
      antes: antes
        ? {
            nombre: antes.nombre,
            nombreCorto: antes.nombreCorto,
            clientePrincipalId: antes.clientePrincipalId,
            clienteFacturacionId: antes.clienteFacturacionId,
          }
        : undefined,
      despues: valores,
    });
    return { ok: true, id };
  });
}

/** Suma un cliente al grupo (si está en otro, hay que sacarlo primero). */
export async function agregarAlGrupo(
  db: Db,
  grupoId: string,
  cliente: string,
  actorId: string,
): Promise<{ ok: true; nombre: string } | { ok: false; error: ErrorGrupo }> {
  return db.transaction(async (tx) => {
    const grupo = await tx.query.gruposEconomicos.findFirst({
      columns: { id: true },
      where: eq(t.gruposEconomicos.id, grupoId),
    });
    if (!grupo) return { ok: false, error: "NO_EXISTE" };
    const fila = await buscarCliente(tx, cliente);
    if (!fila) return { ok: false, error: "CLIENTE_INEXISTENTE" };
    if (fila.grupoId && fila.grupoId !== grupoId) return { ok: false, error: "EN_OTRO_GRUPO" };
    await tx.update(t.clientes).set({ grupoId }).where(eq(t.clientes.id, fila.id));
    await auditar(tx, {
      actorId,
      entidad: "grupo",
      entidadId: grupoId,
      accion: "miembro_alta",
      despues: { clienteId: fila.id },
    });
    return { ok: true, nombre: fila.nombre };
  });
}

/** Saca un cliente del grupo; si era el principal, el grupo queda sin principal. */
export async function quitarDelGrupo(db: Db, grupoId: string, clienteId: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [fila] = await tx
      .update(t.clientes)
      .set({ grupoId: null })
      .where(and(eq(t.clientes.id, clienteId), eq(t.clientes.grupoId, grupoId)))
      .returning({ id: t.clientes.id });
    if (!fila) return false;
    await tx
      .update(t.gruposEconomicos)
      .set({ clientePrincipalId: null })
      .where(
        and(
          eq(t.gruposEconomicos.id, grupoId),
          eq(t.gruposEconomicos.clientePrincipalId, clienteId),
        ),
      );
    await auditar(tx, {
      actorId,
      entidad: "grupo",
      entidadId: grupoId,
      accion: "miembro_baja",
      antes: { clienteId },
    });
    return true;
  });
}

/** Borra un grupo vacío (sin clientes). */
export async function eliminarGrupo(
  db: Db,
  grupoId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorGrupo }> {
  return db.transaction(async (tx) => {
    const [{ miembros } = { miembros: 0 }] = await tx
      .select({ miembros: count() })
      .from(t.clientes)
      .where(eq(t.clientes.grupoId, grupoId));
    if (miembros > 0) return { ok: false, error: "CON_MIEMBROS" };
    const [borrado] = await tx
      .delete(t.gruposEconomicos)
      .where(eq(t.gruposEconomicos.id, grupoId))
      .returning({ nombre: t.gruposEconomicos.nombre });
    if (!borrado) return { ok: false, error: "NO_EXISTE" };
    await auditar(tx, {
      actorId,
      entidad: "grupo",
      entidadId: grupoId,
      accion: "baja",
      antes: { nombre: borrado.nombre },
    });
    return { ok: true };
  });
}
