/*
 * Migra la base de Postgres (Neon) y carga los datos base. Idempotente: se
 * puede correr en cada despliegue. En Vercel lo corre `vercel-build` antes
 * de compilar.
 *
 * Usa la conexión directa (DATABASE_URL_UNPOOLED, la que crea la integración
 * de Neon): las migraciones no deben pasar por el pooler transaccional.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import { sembrarDatosBase } from "../src/server/db/semilla";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

async function principal() {
  if (!url) {
    // Un preview sin base propia no puede migrar; producción sí o sí.
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("Falta DATABASE_URL (o DATABASE_URL_UNPOOLED) para migrar.");
    }
    console.warn("[migrar] sin DATABASE_URL: no se migra (se usará PGlite en desarrollo).");
    return;
  }
  const cliente = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const db = drizzle(cliente, { schema, casing: "snake_case" });
    console.info("[migrar] aplicando migraciones…");
    await migrate(db, { migrationsFolder: "./drizzle" });
    // El catálogo de ejemplo solo si se pide (por ejemplo, en un entorno de pruebas).
    const demo = process.env.STLIC_CATALOGO_DEMO === "1";
    console.info(`[migrar] cargando datos base${demo ? " y catálogo de ejemplo" : ""}…`);
    await sembrarDatosBase(db, { demo });
    console.info("[migrar] listo.");
  } finally {
    await cliente.end({ timeout: 5 });
  }
}

principal().catch((error: unknown) => {
  console.error("[migrar] falló:", error);
  process.exit(1);
});
