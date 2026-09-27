import { and, eq, like } from "drizzle-orm";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/** Si el usuario tiene la verificación en dos pasos activa. */
export async function tieneDosFactores(db: Ejecutor, usuarioId: string): Promise<boolean> {
  const fila = await db.query.usuarios.findFirst({
    columns: { twoFactorEnabled: true },
    where: eq(t.usuarios.id, usuarioId),
  });
  return fila?.twoFactorEnabled ?? false;
}

/** Deja en la auditoría que el usuario activó, desactivó o regeneró su 2FA. */
export async function auditarDosFactores(
  db: Ejecutor,
  usuarioId: string,
  accion: "2fa_activado" | "2fa_desactivado" | "2fa_codigos",
) {
  await auditar(db, { actorId: usuarioId, entidad: "usuario", entidadId: usuarioId, accion });
}

export type ErrorQuitarDosFactores = "PROPIO" | "NO_EXISTE" | "SIN_DOS_FACTORES";

/**
 * Administración le quita el 2FA a otro usuario de SOFTeam que perdió el
 * celular y los códigos de respaldo. También olvida sus dispositivos de
 * confianza y cierra sus sesiones: vuelve a entrar con la contraseña y puede
 * activarlo de nuevo. Nadie puede quitarse el propio por esta vía.
 */
export async function quitarDosFactores(
  db: Db,
  usuarioId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorQuitarDosFactores }> {
  if (usuarioId === actorId) return { ok: false, error: "PROPIO" };
  return db.transaction(async (tx) => {
    const usuario = await tx.query.usuarios.findFirst({
      columns: { id: true, twoFactorEnabled: true, rolSofteam: true },
      where: eq(t.usuarios.id, usuarioId),
    });
    if (!usuario?.rolSofteam) return { ok: false, error: "NO_EXISTE" };
    if (!usuario.twoFactorEnabled) return { ok: false, error: "SIN_DOS_FACTORES" };
    await tx.delete(t.dosFactores).where(eq(t.dosFactores.userId, usuarioId));
    await tx
      .update(t.usuarios)
      .set({ twoFactorEnabled: false })
      .where(eq(t.usuarios.id, usuarioId));
    await tx
      .delete(t.verificaciones)
      .where(
        and(
          eq(t.verificaciones.value, usuarioId),
          like(t.verificaciones.identifier, "trust-device-%"),
        ),
      );
    await tx.delete(t.sesiones).where(eq(t.sesiones.userId, usuarioId));
    await auditar(tx, {
      actorId,
      entidad: "usuario",
      entidadId: usuarioId,
      accion: "2fa_quitado",
    });
    return { ok: true };
  });
}
