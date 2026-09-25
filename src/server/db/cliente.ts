import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migrarPglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const opciones = { schema, casing: "snake_case" } as const;

/** Postgres real (Neon u otro) para producción y preview. */
export function crearDbPostgres(url: string) {
  // `prepare: false` es compatible con el pooler transaccional de Neon/PgBouncer.
  return drizzlePostgres(postgres(url, { prepare: false, max: 10 }), opciones);
}

/**
 * Postgres embebido (PGlite, WebAssembly): desarrollo local y tests sin
 * instalar Postgres ni Docker. Sin `directorio`, la base vive en memoria.
 */
export async function crearDbPglite(directorio?: string) {
  if (directorio) await mkdir(directorio, { recursive: true });
  const cliente = directorio ? new PGlite(directorio) : new PGlite();
  const db = drizzlePglite(cliente, opciones);
  await migrarPglite(db, { migrationsFolder: "./drizzle" });
  return db;
}

/** Tipo común a los dos drivers: el código de la app no sabe cuál está usando. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Transacción de Drizzle, para funciones que deben correr dentro de una. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Una función que acepta la base o una transacción en curso. */
export type Ejecutor = Db | Tx;
