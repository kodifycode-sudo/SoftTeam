import { randomUUID } from "node:crypto";
import { and, like, lt, sql } from "drizzle-orm";
import type { Ejecutor } from "@/server/db/cliente";
import { limitesIntentos } from "@/server/db/schema";

/**
 * Límite de intentos de las acciones públicas (ingreso, alta, códigos por
 * mail). Better Auth limita solo los pedidos que pasan por su ruta HTTP; las
 * Server Actions llaman a `auth.api` directo y no pasan por ese control, así
 * que lo hacemos acá.
 *
 * Ventana fija que empieza con el primer intento. Usa la tabla de Better
 * Auth con claves propias ("stlic:…"): `last_request` guarda el inicio de la
 * ventana. El contador vive en la base (vale para todas las instancias) y el
 * incremento es atómico.
 */

export interface Limite {
  max: number;
  ventanaSegundos: number;
}

export interface UsoIntentos {
  permitido: boolean;
  /** Segundos hasta que se puede volver a intentar (0 si está permitido). */
  reintentarEn: number;
}

export async function registrarIntento(
  db: Ejecutor,
  clave: string,
  limite: Limite,
  ahora: number = Date.now(),
): Promise<UsoIntentos> {
  const ventanaMs = limite.ventanaSegundos * 1000;
  const vencida = sql`${limitesIntentos.lastRequest} <= ${ahora - ventanaMs}::bigint`;
  const [fila] = await db
    .insert(limitesIntentos)
    .values({ id: randomUUID(), key: `stlic:${clave}`, count: 1, lastRequest: ahora })
    .onConflictDoUpdate({
      target: limitesIntentos.key,
      set: {
        count: sql`case when ${vencida} then 1 else ${limitesIntentos.count} + 1 end`,
        lastRequest: sql`case when ${vencida} then ${ahora}::bigint else ${limitesIntentos.lastRequest} end`,
      },
    })
    .returning({ count: limitesIntentos.count, inicio: limitesIntentos.lastRequest });
  const count = fila?.count ?? 1;
  const inicio = fila?.inicio ?? ahora;
  if (count <= limite.max) return { permitido: true, reintentarEn: 0 };
  return {
    permitido: false,
    reintentarEn: Math.max(1, Math.ceil((inicio + ventanaMs - ahora) / 1000)),
  };
}

/**
 * IP del cliente. En Vercel `x-real-ip` y `x-forwarded-for` los pone la
 * plataforma (no los del cliente); sin ellas (desarrollo) todo cuenta como
 * una sola IP.
 */
export function ipDe(cabeceras: Headers): string {
  const real = cabeceras.get("x-real-ip")?.trim();
  if (real) return real;
  const reenviada = cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim();
  return reenviada || "local";
}

/** Borra los contadores propios de más de un día (lo corre el proceso diario). */
export async function limpiarIntentos(db: Ejecutor, ahora: number = Date.now()): Promise<number> {
  const borradas = await db
    .delete(limitesIntentos)
    .where(
      and(
        like(limitesIntentos.key, "stlic:%"),
        lt(limitesIntentos.lastRequest, ahora - 24 * 60 * 60_000),
      ),
    )
    .returning({ id: limitesIntentos.id });
  return borradas.length;
}
