import { lt, sql } from "drizzle-orm";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

export interface UsoApi {
  permitido: boolean;
  limite: number;
  /** Pedidos que le quedan en el minuto. */
  restantes: number;
  /** Segundos hasta que empieza el minuto siguiente. */
  reinicio: number;
}

/**
 * Cuenta un pedido del sistema en el minuto actual (ventana fija) y dice si
 * entra en su límite. El contador vive en la base: vale para todas las
 * instancias. El incremento es atómico, así que dos pedidos simultáneos no
 * se pisan.
 */
export async function registrarPedido(
  db: Ejecutor,
  apiClienteId: string,
  limite: number,
  ahora: Date = new Date(),
): Promise<UsoApi> {
  const ventana = new Date(Math.floor(ahora.getTime() / 60_000) * 60_000);
  const [fila] = await db
    .insert(t.apiUso)
    .values({ apiClienteId, ventana, pedidos: 1 })
    .onConflictDoUpdate({
      target: [t.apiUso.apiClienteId, t.apiUso.ventana],
      set: { pedidos: sql`${t.apiUso.pedidos} + 1` },
    })
    .returning({ pedidos: t.apiUso.pedidos });
  const pedidos = fila?.pedidos ?? 1;
  return {
    permitido: pedidos <= limite,
    limite,
    restantes: Math.max(0, limite - pedidos),
    reinicio: Math.max(1, Math.ceil((ventana.getTime() + 60_000 - ahora.getTime()) / 1000)),
  };
}

/** Borra los contadores de más de un día (lo corre el proceso diario). */
export async function limpiarUsoApi(db: Ejecutor, ahora: Date = new Date()) {
  const borradas = await db
    .delete(t.apiUso)
    .where(lt(t.apiUso.ventana, new Date(ahora.getTime() - 24 * 60 * 60_000)))
    .returning({ ventana: t.apiUso.ventana });
  return borradas.length;
}

/** Pedidos de cada sistema en la última hora (para la pantalla de integraciones). */
export async function usoUltimaHora(db: Ejecutor, ahora: Date = new Date()) {
  const filas = await db
    .select({
      apiClienteId: t.apiUso.apiClienteId,
      pedidos: sql<number>`sum(${t.apiUso.pedidos})::int`,
      pico: sql<number>`max(${t.apiUso.pedidos})::int`,
    })
    .from(t.apiUso)
    .where(sql`${t.apiUso.ventana} >= ${new Date(ahora.getTime() - 60 * 60_000)}`)
    .groupBy(t.apiUso.apiClienteId);
  return new Map(filas.map((f) => [f.apiClienteId, { pedidos: f.pedidos, pico: f.pico }]));
}
