import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { registrarCambioEmpresa } from "../integraciones/eventos";

export async function listarOficinas(db: Ejecutor, empresaId: string) {
  return db
    .select({
      id: t.oficinas.id,
      codigo: t.oficinas.codigo,
      nombre: t.oficinas.nombre,
      telefono: t.oficinas.telefono,
      domicilio: t.oficinas.domicilio,
      activa: t.oficinas.activa,
      canalId: t.canales.id,
      canalCodigo: t.canales.codigo,
      canalNombre: t.canales.nombre,
      colaboradores: sql<number>`(select count(*)::int from ${t.colaboradores} c where c.oficina_id = ${t.oficinas.id} and c.activo)`,
    })
    .from(t.oficinas)
    .innerJoin(t.canales, eq(t.canales.id, t.oficinas.canalId))
    .where(eq(t.oficinas.empresaId, empresaId))
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
