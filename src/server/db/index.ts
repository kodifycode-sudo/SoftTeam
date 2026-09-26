import "server-only";
import { env } from "@/env";
import { crearDbPglite, crearDbPostgres, type Db } from "./cliente";
import { sembrarDatosBase } from "./semilla";

export type { Db } from "./cliente";

const global = globalThis as unknown as { __stlicDb?: Promise<Db> };

async function inicializar(): Promise<Db> {
  if (env.DATABASE_URL) return crearDbPostgres(env.DATABASE_URL, env.DATABASE_POOL_MAX);
  // Desarrollo sin Postgres: base embebida persistente, migrada y sembrada al arrancar.
  const db = await crearDbPglite(".data/pglite");
  await sembrarDatosBase(db, { demo: true });
  return db;
}

/**
 * Conexión única por proceso. Se guarda en `globalThis` para que la recarga
 * en caliente de desarrollo no abra una conexión nueva en cada cambio.
 */
export function obtenerDb(): Promise<Db> {
  global.__stlicDb ??= inicializar().catch((error: unknown) => {
    global.__stlicDb = undefined;
    throw error;
  });
  return global.__stlicDb;
}
