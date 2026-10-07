import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./cliente";
import { crearDbDePrueba } from "./pruebas";
import * as t from "./schema";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

describe("base de prueba", () => {
  it("rechaza un Date suelto como en producción (postgres-js)", async () => {
    // Drizzle envuelve el error ("Failed query…") y deja el de la guarda como causa.
    const rechazo = {
      cause: expect.objectContaining({ message: expect.stringMatching(/Date suelto/) }),
    };
    await expect(db.execute(sql`select ${new Date()} as ahora`)).rejects.toMatchObject(rechazo);
    await expect(
      db.transaction((tx) => tx.execute(sql`select ${new Date()} as ahora`)),
    ).rejects.toMatchObject(rechazo);
  });

  it("acepta las fechas que pasan por una columna", async () => {
    const filas = await db
      .select({ id: t.clientes.id })
      .from(t.clientes)
      .where(sql`${t.clientes.creadoEn} >= ${new Date(0).toISOString()}`);
    expect(Array.isArray(filas)).toBe(true);
  });
});
