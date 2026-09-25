import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { cifrar, descifrar, generarSecreto } from "@/server/seguridad/cifrado";

/** Sistemas que consumen la API (productos). El secreto nunca se lista: se muestra una sola vez. */
export function listarSistemas(db: Ejecutor) {
  return db
    .select({
      id: t.apiClientes.id,
      sistema: t.apiClientes.sistema,
      nombre: t.apiClientes.nombre,
      webhookUrl: t.apiClientes.webhookUrl,
      activo: t.apiClientes.activo,
      ultimoUsoEn: t.apiClientes.ultimoUsoEn,
      creadoEn: t.apiClientes.creadoEn,
    })
    .from(t.apiClientes)
    .orderBy(asc(t.apiClientes.sistema));
}

const urlWebhook = z
  .url({ protocol: /^https?$/, error: "Ingresá una URL http(s) válida" })
  .max(300)
  .refine((u) => process.env.NODE_ENV !== "production" || u.startsWith("https://"), {
    error: "En producción el webhook tiene que ser https",
  });

export const esquemaSistema = z.object({
  sistema: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{2,29}$/, { error: "3 a 30 caracteres: minúsculas, números o guiones" }),
  nombre: z.string().trim().min(3, { error: "Ingresá el nombre" }).max(60),
  webhookUrl: urlWebhook.optional(),
});

export type EntradaSistema = z.infer<typeof esquemaSistema>;

/** Da de alta un sistema y devuelve su secreto en claro (única vez que se ve). */
export async function crearSistema(
  db: Db,
  entrada: EntradaSistema,
  claveMaestra: string,
  actorId: string,
): Promise<{ ok: true; secreto: string } | { ok: false; error: "SISTEMA_DUPLICADO" }> {
  const existe = await db.query.apiClientes.findFirst({
    where: eq(t.apiClientes.sistema, entrada.sistema),
  });
  if (existe) return { ok: false, error: "SISTEMA_DUPLICADO" };
  const secreto = generarSecreto();
  await db.transaction(async (tx) => {
    const [fila] = await tx
      .insert(t.apiClientes)
      .values({
        sistema: entrada.sistema,
        nombre: entrada.nombre,
        webhookUrl: entrada.webhookUrl ?? null,
        secretoCifrado: cifrar(secreto, claveMaestra),
      })
      .returning({ id: t.apiClientes.id });
    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "sistema_api",
      entidadId: fila?.id ?? entrada.sistema,
      accion: "alta",
      despues: { sistema: entrada.sistema, webhookUrl: entrada.webhookUrl ?? null },
    });
  });
  return { ok: true, secreto };
}

/** Genera un secreto nuevo (el anterior deja de valer en el acto). */
export async function rotarSecreto(db: Db, id: string, claveMaestra: string, actorId: string) {
  const secreto = generarSecreto();
  const filas = await db
    .update(t.apiClientes)
    .set({ secretoCifrado: cifrar(secreto, claveMaestra) })
    .where(eq(t.apiClientes.id, id))
    .returning({ id: t.apiClientes.id });
  if (!filas.length) return undefined;
  await db.insert(t.auditoria).values({
    actorId,
    actorTipo: "usuario",
    entidad: "sistema_api",
    entidadId: id,
    accion: "rotar_secreto",
  });
  return secreto;
}

export async function actualizarSistema(
  db: Db,
  id: string,
  cambios: { webhookUrl?: string | null; activo?: boolean },
  actorId: string,
) {
  await db.transaction(async (tx) => {
    await tx.update(t.apiClientes).set(cambios).where(eq(t.apiClientes.id, id));
    await tx.insert(t.auditoria).values({
      actorId,
      actorTipo: "usuario",
      entidad: "sistema_api",
      entidadId: id,
      accion: "modificacion",
      despues: cambios,
    });
  });
}

/** Secreto en claro de un sistema activo (para verificar firmas o firmar webhooks). */
export async function secretoDeSistema(db: Ejecutor, sistema: string, claveMaestra: string) {
  const fila = await db.query.apiClientes.findFirst({ where: eq(t.apiClientes.sistema, sistema) });
  if (!fila || !fila.activo) return undefined;
  return {
    id: fila.id,
    webhookUrl: fila.webhookUrl,
    secreto: descifrar(fila.secretoCifrado, claveMaestra),
  };
}
