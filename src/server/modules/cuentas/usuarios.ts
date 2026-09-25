import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

export interface UsuarioLogin {
  id: string;
  nombre: string;
  email: string;
  verificado: boolean;
  rolSofteam: string | null;
  /** Se creó ahora: todavía no tiene contraseña (la elige al activar su acceso). */
  nuevo: boolean;
}

export const normalizarEmail = (email: string) => email.trim().toLowerCase();

export async function buscarUsuarioPorEmail(db: Ejecutor, email: string) {
  return db.query.usuarios.findFirst({ where: eq(t.usuarios.email, normalizarEmail(email)) });
}

/**
 * Usuario de login para un mail: el existente o uno nuevo, sin contraseña y
 * sin verificar. La persona lo activa eligiendo su contraseña con un código
 * que recibe por mail (eso además verifica el mail).
 */
export async function asegurarUsuario(
  db: Ejecutor,
  datos: { email: string; nombre: string },
): Promise<UsuarioLogin> {
  const email = normalizarEmail(datos.email);
  const existente = await buscarUsuarioPorEmail(db, email);
  if (existente) {
    return {
      id: existente.id,
      nombre: existente.name,
      email: existente.email,
      verificado: existente.emailVerified,
      rolSofteam: existente.rolSofteam,
      nuevo: false,
    };
  }
  const [creado] = await db
    .insert(t.usuarios)
    .values({ id: randomUUID(), name: datos.nombre, email, emailVerified: false })
    .onConflictDoNothing()
    .returning();
  // Carrera con otra alta del mismo mail: se usa la que quedó.
  if (!creado) return asegurarUsuario(db, datos);
  return {
    id: creado.id,
    nombre: creado.name,
    email: creado.email,
    verificado: false,
    rolSofteam: null,
    nuevo: true,
  };
}

/**
 * Vincula al usuario con los colaboradores que tienen su mail y todavía no
 * tienen usuario. Se llama al ingresar: el mail ya está verificado.
 */
export async function vincularColaboradores(db: Ejecutor, usuarioId: string, email: string) {
  await db
    .update(t.colaboradores)
    .set({ usuarioId })
    .where(
      and(
        isNull(t.colaboradores.usuarioId),
        sql`lower(${t.colaboradores.email}) = ${normalizarEmail(email)}`,
      ),
    );
}
