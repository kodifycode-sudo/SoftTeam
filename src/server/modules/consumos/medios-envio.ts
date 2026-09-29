import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/** Medio por defecto de los envíos: no se puede desactivar. */
export const MEDIO_POR_DEFECTO = "mail";

export const listarMediosEnvio = (db: Db) =>
  db
    .select()
    .from(t.mediosEnvio)
    .orderBy(asc(t.mediosEnvio.factorCentesimos), asc(t.mediosEnvio.nombre));

export const esquemaMedioEnvio = z.object({
  id: z.string().min(1),
  /** Créditos que consume cada envío, con hasta dos decimales ("1", "2,5"). */
  factor: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 100, {
      error: "Un factor mayor que 0 y hasta 100 (hasta dos decimales).",
    })
    .transform((v) => Math.round(Number(v) * 100)),
  activo: z.boolean(),
});

export type ErrorMedioEnvio = "NO_EXISTE" | "POR_DEFECTO";

/**
 * SOFTeam cambia el factor de un medio de envío (créditos por envío) o lo
 * desactiva. Rige para los consumos siguientes: los ya registrados guardan su
 * factor. El mail, medio por defecto, no se desactiva.
 */
export async function guardarMedioEnvio(
  db: Db,
  entrada: z.infer<typeof esquemaMedioEnvio>,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorMedioEnvio }> {
  if (entrada.id === MEDIO_POR_DEFECTO && !entrada.activo)
    return { ok: false, error: "POR_DEFECTO" };
  return db.transaction(async (tx) => {
    const antes = await tx.query.mediosEnvio.findFirst({ where: eq(t.mediosEnvio.id, entrada.id) });
    if (!antes) return { ok: false, error: "NO_EXISTE" };
    await tx
      .update(t.mediosEnvio)
      .set({ factorCentesimos: entrada.factor, activo: entrada.activo })
      .where(eq(t.mediosEnvio.id, entrada.id));
    await auditar(tx, {
      actorId,
      entidad: "medio_envio",
      entidadId: entrada.id,
      accion: "modificacion",
      antes: { factor: antes.factorCentesimos / 100, activo: antes.activo },
      despues: { factor: entrada.factor / 100, activo: entrada.activo },
    });
    return { ok: true };
  });
}
