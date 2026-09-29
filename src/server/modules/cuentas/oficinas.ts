import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { type Alcance, abarcaOficina, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { oficinaEnAlcance } from "./alcance";

export async function listarOficinas(
  db: Ejecutor,
  empresaId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  return db
    .select({
      id: t.oficinas.id,
      codigo: t.oficinas.codigo,
      nombre: t.oficinas.nombre,
      telefono: t.oficinas.telefono,
      domicilio: t.oficinas.domicilio,
      whatsapp: t.oficinas.whatsapp,
      redes: t.oficinas.redes,
      notifica: t.oficinas.notifica,
      activa: t.oficinas.activa,
      canalId: t.canales.id,
      canalCodigo: t.canales.codigo,
      canalNombre: t.canales.nombre,
      colaboradores: sql<number>`(select count(*)::int from ${t.colaboradores} c where c.oficina_id = ${t.oficinas.id} and c.activo)`,
      /** Compra delegada facturada a otro cliente (lo asigna SOFTeam). */
      facturaA: sql<
        string | null
      >`(select c.nombre_factura from ${t.clientes} c where c.id = ${t.oficinas.clienteFacturacionId} and c.activo)`,
    })
    .from(t.oficinas)
    .innerJoin(t.canales, eq(t.canales.id, t.oficinas.canalId))
    .where(and(eq(t.oficinas.empresaId, empresaId), oficinaEnAlcance(t.oficinas.id, alcance)))
    .orderBy(asc(t.canales.codigo), asc(t.oficinas.codigo));
}

export function listarCanales(db: Ejecutor, empresaId: string) {
  return db
    .select()
    .from(t.canales)
    .where(eq(t.canales.empresaId, empresaId))
    .orderBy(asc(t.canales.codigo));
}

export const esquemaOficina = z
  .object({
    nombre: z.string().trim().min(2, { error: "Ingresá el nombre" }).max(80),
    telefono: z.string().trim().max(30).optional(),
    domicilio: z.string().trim().max(160).optional(),
    /** Canal existente, o vacío para crear uno nuevo con `canalNuevo`. */
    canalId: z.uuid().optional(),
    canalNuevo: z.string().trim().max(60).optional(),
  })
  .refine((o) => o.canalId || o.canalNuevo, {
    path: ["canalId"],
    error: "Elegí un canal o creá uno nuevo",
  });

export type EntradaOficina = z.infer<typeof esquemaOficina>;

/** Próximo código libre ("01" → "02", "001" → "002"). */
function siguiente(codigos: string[], largo: number): string | undefined {
  const maximo = codigos.reduce((m, c) => Math.max(m, Number(c) || 0), 0);
  const nuevo = maximo + 1;
  return nuevo < 10 ** largo ? String(nuevo).padStart(largo, "0") : undefined;
}

export type ErrorOficina = "CANAL_INVALIDO" | "SIN_CODIGOS";

/**
 * Crea una oficina en un canal de la empresa (o en un canal nuevo). Numera
 * automáticamente: canal CC y oficina OOO. Bloquea la empresa para que dos
 * altas simultáneas no tomen el mismo código.
 */
export async function crearOficina(
  db: Db,
  empresaId: string,
  entrada: EntradaOficina,
  actorId: string,
): Promise<{ ok: true; codigo: string } | { ok: false; error: ErrorOficina }> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: t.empresas.id })
      .from(t.empresas)
      .where(eq(t.empresas.id, empresaId))
      .for("update");

    let canal: { id: string; codigo: string } | undefined;
    if (entrada.canalId) {
      [canal] = await tx
        .select({ id: t.canales.id, codigo: t.canales.codigo })
        .from(t.canales)
        .where(and(eq(t.canales.id, entrada.canalId), eq(t.canales.empresaId, empresaId)));
      if (!canal) return { ok: false as const, error: "CANAL_INVALIDO" as const };
    } else {
      const existentes = await tx
        .select({ codigo: t.canales.codigo })
        .from(t.canales)
        .where(eq(t.canales.empresaId, empresaId));
      const codigo = siguiente(
        existentes.map((c) => c.codigo),
        2,
      );
      if (!codigo) return { ok: false as const, error: "SIN_CODIGOS" as const };
      [canal] = await tx
        .insert(t.canales)
        .values({ empresaId, codigo, nombre: entrada.canalNuevo as string })
        .returning({ id: t.canales.id, codigo: t.canales.codigo });
    }
    if (!canal) return { ok: false as const, error: "CANAL_INVALIDO" as const };

    const oficinasCanal = await tx
      .select({ codigo: t.oficinas.codigo })
      .from(t.oficinas)
      .where(eq(t.oficinas.canalId, canal.id));
    const codigo = siguiente(
      oficinasCanal.map((o) => o.codigo),
      3,
    );
    if (!codigo) return { ok: false as const, error: "SIN_CODIGOS" as const };

    const [oficina] = await tx
      .insert(t.oficinas)
      .values({
        empresaId,
        canalId: canal.id,
        codigo,
        nombre: entrada.nombre,
        telefono: entrada.telefono || null,
        domicilio: entrada.domicilio || null,
      })
      .returning({ id: t.oficinas.id });

    // Cambió la estructura de la empresa: los productos deben resincronizar.
    await registrarCambioEmpresa(tx, [empresaId]);
    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "oficina",
      empresaId: empresaId,
      entidadId: oficina?.id ?? "",
      accion: "alta",
      despues: { empresaId, codigo: `${canal.codigo}-${codigo}`, nombre: entrada.nombre },
    });
    return { ok: true as const, codigo: `${canal.codigo}-${codigo}` };
  });
}

const red = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => v || undefined);

export const esquemaEdicionOficina = z.object({
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre" }).max(80),
  telefono: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  domicilio: z.string().trim().max(160).optional(),
  web: red,
  facebook: red,
  instagram: red,
  linkedin: red,
  notifica: z.boolean().default(true),
  activa: z.boolean(),
});

export type EntradaEdicionOficina = z.infer<typeof esquemaEdicionOficina>;

export type ErrorEdicionOficina = "NO_EXISTE" | "SIN_PERMISO" | "ULTIMA_OFICINA";

/**
 * Edita una oficina (datos de contacto y redes) o la desactiva. Un delegado
 * edita las de su alcance, pero no desactiva la propia oficina (quedaría sin
 * lo que administra). La empresa conserva siempre una oficina activa. Una
 * oficina inactiva deja de consumir y los productos reciben el cambio.
 */
export async function editarOficina(
  db: Db,
  empresaId: string,
  oficinaId: string,
  entrada: EntradaEdicionOficina,
  actor: { usuarioId: string; alcance: Alcance },
): Promise<{ ok: true } | { ok: false; error: ErrorEdicionOficina }> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: t.empresas.id })
      .from(t.empresas)
      .where(eq(t.empresas.id, empresaId))
      .for("update");
    const antes = await tx.query.oficinas.findFirst({
      where: and(eq(t.oficinas.id, oficinaId), eq(t.oficinas.empresaId, empresaId)),
    });
    if (!antes || !abarcaOficina(actor.alcance, { id: antes.id, canalId: antes.canalId })) {
      return { ok: false, error: "NO_EXISTE" };
    }
    if (antes.activa !== entrada.activa && actor.alcance.tipo === "oficina") {
      return { ok: false, error: "SIN_PERMISO" };
    }
    if (antes.activa && !entrada.activa) {
      const [{ activas } = { activas: 0 }] = await tx
        .select({ activas: sql<number>`count(*)::int` })
        .from(t.oficinas)
        .where(and(eq(t.oficinas.empresaId, empresaId), eq(t.oficinas.activa, true)));
      if (activas <= 1) return { ok: false, error: "ULTIMA_OFICINA" };
    }
    const redes = Object.fromEntries(
      (["web", "facebook", "instagram", "linkedin"] as const)
        .filter((r) => entrada[r])
        .map((r) => [r, entrada[r] as string]),
    );
    const valores = {
      nombre: entrada.nombre,
      telefono: entrada.telefono || null,
      whatsapp: entrada.whatsapp || null,
      domicilio: entrada.domicilio || null,
      redes: Object.keys(redes).length ? redes : null,
      notifica: entrada.notifica,
      activa: entrada.activa,
    };
    await tx.update(t.oficinas).set(valores).where(eq(t.oficinas.id, oficinaId));
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId: actor.usuarioId,
      entidad: "oficina",
      entidadId: oficinaId,
      empresaId,
      accion:
        antes.activa !== entrada.activa
          ? entrada.activa
            ? "reactivacion"
            : "baja"
          : "modificacion",
      antes: {
        nombre: antes.nombre,
        telefono: antes.telefono,
        whatsapp: antes.whatsapp,
        domicilio: antes.domicilio,
        redes: antes.redes,
        notifica: antes.notifica,
        activa: antes.activa,
      },
      despues: valores,
    });
    return { ok: true };
  });
}

/** Renombra un canal de la empresa (toda la empresa, o el delegado de ese canal). */
export async function renombrarCanal(
  db: Db,
  empresaId: string,
  canalId: string,
  nombre: string,
  actor: { usuarioId: string; alcance: Alcance },
): Promise<boolean> {
  const limpio = nombre.trim().slice(0, 60);
  if (limpio.length < 2) return false;
  if (actor.alcance.tipo === "oficina") return false;
  if (actor.alcance.tipo === "canal" && actor.alcance.canalId !== canalId) return false;
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ nombre: t.canales.nombre })
      .from(t.canales)
      .where(and(eq(t.canales.id, canalId), eq(t.canales.empresaId, empresaId)));
    if (!antes) return false;
    await tx.update(t.canales).set({ nombre: limpio }).where(eq(t.canales.id, canalId));
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId: actor.usuarioId,
      entidad: "canal",
      entidadId: canalId,
      empresaId,
      accion: "modificacion",
      antes,
      despues: { nombre: limpio },
    });
    return true;
  });
}
