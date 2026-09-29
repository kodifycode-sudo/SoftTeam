import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  LISTA_TIPOS_USUARIO,
  MEDIOS_COMUNICACION,
  type MedioComunicacion,
} from "@/domain/comunicaciones/tipos";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { registrarCambioEmpresa } from "../integraciones/eventos";

export function listarTiposComunicacion(db: Ejecutor, empresaId: string) {
  return db
    .select()
    .from(t.tiposComunicacion)
    .where(eq(t.tiposComunicacion.empresaId, empresaId))
    .orderBy(sql`${t.tiposComunicacion.activo} desc`, asc(t.tiposComunicacion.codigo));
}

export type TipoComunicacionListado = Awaited<ReturnType<typeof listarTiposComunicacion>>[number];

const tipoUsuario = z.enum(LISTA_TIPOS_USUARIO, { error: "Tipo de usuario inválido." });

const medios = z.object(
  Object.fromEntries(
    (Object.keys(MEDIOS_COMUNICACION) as MedioComunicacion[]).map((m) => [m, z.boolean()]),
  ) as Record<MedioComunicacion, z.ZodBoolean>,
);

export const esquemaTipoComunicacion = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre." }).max(80),
  medios: medios.refine((m) => Object.values(m).some(Boolean), {
    error: "Elegí al menos un medio.",
  }),
  reglas: z
    .array(
      z.object({
        origen: tipoUsuario,
        destinos: z
          .array(tipoUsuario)
          .min(1, { error: "Cada origen necesita al menos un destinatario." }),
        autorizantes: z.array(tipoUsuario),
      }),
    )
    .min(1, { error: "Agregá al menos quién la origina y a quién llega." })
    .refine((r) => new Set(r.map((x) => x.origen)).size === r.length, {
      error: "Cada tipo de usuario puede originarla una sola vez.",
    })
    // Sin repetidos dentro de cada lista.
    .transform((r) =>
      r.map((x) => ({
        origen: x.origen,
        destinos: [...new Set(x.destinos)],
        autorizantes: [...new Set(x.autorizantes)],
      })),
    ),
  activo: z.boolean(),
});

export type EntradaTipoComunicacion = z.infer<typeof esquemaTipoComunicacion>;

export type ErrorTipoComunicacion = "NO_EXISTE" | "NOMBRE_EXISTENTE";

/**
 * Crea o modifica un tipo de comunicación de la empresa. El código se asigna
 * al crearlo (siguiente de la empresa) y no cambia. Los productos reciben el
 * cambio en EmpresaFull.
 */
export async function guardarTipoComunicacion(
  db: Db,
  empresaId: string,
  entrada: EntradaTipoComunicacion,
  actorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: ErrorTipoComunicacion }> {
  return db.transaction(async (tx) => {
    // Serializa por empresa: el código es correlativo dentro de ella.
    await tx
      .select({ id: t.empresas.id })
      .from(t.empresas)
      .where(eq(t.empresas.id, empresaId))
      .for("update");
    const antes = entrada.id
      ? await tx.query.tiposComunicacion.findFirst({
          where: and(
            eq(t.tiposComunicacion.id, entrada.id),
            eq(t.tiposComunicacion.empresaId, empresaId),
          ),
        })
      : undefined;
    if (entrada.id && !antes) return { ok: false, error: "NO_EXISTE" };
    const repetido = await tx.query.tiposComunicacion.findFirst({
      columns: { id: true },
      where: and(
        eq(t.tiposComunicacion.empresaId, empresaId),
        sql`lower(${t.tiposComunicacion.nombre}) = lower(${entrada.nombre})`,
        antes ? ne(t.tiposComunicacion.id, antes.id) : undefined,
      ),
    });
    if (repetido) return { ok: false, error: "NOMBRE_EXISTENTE" };

    const valores = {
      nombre: entrada.nombre,
      medios: entrada.medios,
      reglas: entrada.reglas,
      activo: entrada.activo,
    };
    let id: string;
    if (antes) {
      await tx.update(t.tiposComunicacion).set(valores).where(eq(t.tiposComunicacion.id, antes.id));
      id = antes.id;
    } else {
      const [{ ultimo } = { ultimo: 0 }] = await tx
        .select({ ultimo: sql<number>`coalesce(max(${t.tiposComunicacion.codigo}), 0)::int` })
        .from(t.tiposComunicacion)
        .where(eq(t.tiposComunicacion.empresaId, empresaId));
      id = crypto.randomUUID();
      await tx
        .insert(t.tiposComunicacion)
        .values({ id, empresaId, codigo: ultimo + 1, ...valores });
    }
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "tipo_comunicacion",
      entidadId: id,
      empresaId,
      accion: antes ? "modificacion" : "alta",
      antes: antes
        ? { nombre: antes.nombre, medios: antes.medios, reglas: antes.reglas, activo: antes.activo }
        : null,
      despues: valores,
    });
    return { ok: true, id };
  });
}
