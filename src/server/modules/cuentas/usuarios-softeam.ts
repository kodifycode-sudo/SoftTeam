import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { asegurarUsuario, type UsuarioLogin } from "./usuarios";

export const ROLES_SOFTEAM = ["ADMINISTRACION", "COMERCIAL", "SOPORTE"] as const;
export type RolSofteam = (typeof ROLES_SOFTEAM)[number];

export async function listarUsuariosSofteam(db: Ejecutor) {
  return db
    .select({
      id: t.usuarios.id,
      nombre: t.usuarios.name,
      email: t.usuarios.email,
      rol: t.usuarios.rolSofteam,
      verificado: t.usuarios.emailVerified,
      desde: t.usuarios.createdAt,
      // Columna externa calificada a mano: sin joins, Drizzle la escribiría sin
      // tabla ("id") y dentro de la subconsulta se leería como la de sesiones.
      ultimoIngreso:
        sql<Date | null>`(select max(s.created_at) from ${t.sesiones} s where s.user_id = "usuarios"."id")`.mapWith(
          t.sesiones.createdAt,
        ),
    })
    .from(t.usuarios)
    .where(isNotNull(t.usuarios.rolSofteam))
    .orderBy(asc(t.usuarios.name));
}

export const esquemaInvitacionSofteam = z.object({
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre" }).max(120),
  email: z.email({ error: "Ingresá un mail válido" }).trim().toLowerCase().max(160),
  rol: z.enum(ROLES_SOFTEAM, { error: "Elegí el rol" }),
});

export type ErrorUsuarioSofteam =
  | "YA_EXISTE"
  | "ES_CLIENTE"
  | "NO_EXISTE"
  | "PROPIO"
  | "ULTIMO_ADMIN";

/**
 * Da acceso al panel SOFTeam. Si la persona no tiene usuario se crea sin
 * contraseña: la elige al activar el acceso desde el mail de invitación. Un
 * usuario de un cliente no puede ser además de SOFTeam (los paneles son
 * excluyentes).
 */
export async function invitarUsuarioSofteam(
  db: Db,
  datos: z.infer<typeof esquemaInvitacionSofteam>,
  actorId: string,
): Promise<{ ok: true; usuario: UsuarioLogin } | { ok: false; error: ErrorUsuarioSofteam }> {
  return db.transaction(async (tx) => {
    const usuario = await asegurarUsuario(tx, datos);
    if (usuario.rolSofteam) return { ok: false, error: "YA_EXISTE" };
    const cliente = await tx.query.colaboradores.findFirst({
      columns: { id: true },
      where: eq(t.colaboradores.usuarioId, usuario.id),
    });
    const alta = await tx.query.solicitudesAlta.findFirst({
      columns: { usuarioId: true },
      where: eq(t.solicitudesAlta.usuarioId, usuario.id),
    });
    if (cliente || alta) return { ok: false, error: "ES_CLIENTE" };

    await tx.update(t.usuarios).set({ rolSofteam: datos.rol }).where(eq(t.usuarios.id, usuario.id));
    await auditar(tx, {
      actorId,
      entidad: "usuario_softeam",
      entidadId: usuario.id,
      accion: "alta",
      despues: { email: usuario.email, rol: datos.rol },
    });
    return { ok: true, usuario: { ...usuario, rolSofteam: datos.rol } };
  });
}

/**
 * Cambia el rol o quita el acceso (`rol` null). Nadie cambia su propio rol, y
 * siempre queda al menos una persona de Administración. Al quitar el acceso
 * se cierran sus sesiones.
 */
export async function cambiarRolSofteam(
  db: Db,
  usuarioId: string,
  rol: RolSofteam | null,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorUsuarioSofteam }> {
  if (usuarioId === actorId) return { ok: false, error: "PROPIO" };
  return db.transaction(async (tx) => {
    // Bloquea a los administradores: dos bajas simultáneas no dejan el panel sin ninguno.
    const administradores = await tx
      .select({ id: t.usuarios.id })
      .from(t.usuarios)
      .where(eq(t.usuarios.rolSofteam, "ADMINISTRACION"))
      .for("update");
    const usuario = await tx.query.usuarios.findFirst({
      where: and(eq(t.usuarios.id, usuarioId), isNotNull(t.usuarios.rolSofteam)),
    });
    if (!usuario) return { ok: false, error: "NO_EXISTE" };
    if (
      usuario.rolSofteam === "ADMINISTRACION" &&
      rol !== "ADMINISTRACION" &&
      administradores.filter((a) => a.id !== usuarioId).length === 0
    ) {
      return { ok: false, error: "ULTIMO_ADMIN" };
    }
    await tx.update(t.usuarios).set({ rolSofteam: rol }).where(eq(t.usuarios.id, usuarioId));
    if (rol === null) {
      await tx.delete(t.sesiones).where(eq(t.sesiones.userId, usuarioId));
    }
    await auditar(tx, {
      actorId,
      entidad: "usuario_softeam",
      entidadId: usuarioId,
      accion: rol === null ? "baja" : "cambio_rol",
      antes: { rol: usuario.rolSofteam },
      despues: { rol },
    });
    return { ok: true };
  });
}

/** Rol vigente, leído de la base (no de la cookie de sesión, que puede estar desactualizada). */
export async function rolSofteamActual(db: Ejecutor, usuarioId: string) {
  const fila = await db.query.usuarios.findFirst({
    columns: { rolSofteam: true },
    where: eq(t.usuarios.id, usuarioId),
  });
  return fila?.rolSofteam ?? null;
}
