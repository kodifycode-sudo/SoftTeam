import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { quitarDosFactores, tieneDosFactores } from "./dos-factores";

let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

/** Usuario de SOFTeam con 2FA activo, una sesión abierta y un dispositivo de confianza. */
async function conDosFactores(rol: "SOPORTE" | null = "SOPORTE") {
  const id = crypto.randomUUID();
  await db.insert(t.usuarios).values({
    id,
    name: "Persona",
    email: `${id}@softeam.com.ar`,
    emailVerified: true,
    rolSofteam: rol,
    twoFactorEnabled: true,
  });
  await db
    .insert(t.dosFactores)
    .values({ id: crypto.randomUUID(), userId: id, secret: "cifrado", backupCodes: "cifrados" });
  await db.insert(t.sesiones).values({
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    userId: id,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await db.insert(t.verificaciones).values({
    id: crypto.randomUUID(),
    identifier: `trust-device-${crypto.randomUUID()}`,
    value: id,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return id;
}

describe("quitar la verificación en dos pasos", () => {
  it("borra el segundo factor, los dispositivos de confianza y las sesiones", async () => {
    const id = await conDosFactores();
    expect(await tieneDosFactores(db, id)).toBe(true);
    expect(await quitarDosFactores(db, id, "admin")).toEqual({ ok: true });

    expect(await tieneDosFactores(db, id)).toBe(false);
    expect(await db.$count(t.dosFactores, eq(t.dosFactores.userId, id))).toBe(0);
    expect(await db.$count(t.sesiones, eq(t.sesiones.userId, id))).toBe(0);
    expect(await db.$count(t.verificaciones, eq(t.verificaciones.value, id))).toBe(0);
    const auditoria = await db.query.auditoria.findFirst({
      where: eq(t.auditoria.entidadId, id),
    });
    expect(auditoria).toMatchObject({ accion: "2fa_quitado", actorId: "admin" });
  });

  it("no se lo quita uno mismo, ni a quien no es de SOFTeam o no lo tiene", async () => {
    const id = await conDosFactores();
    expect(await quitarDosFactores(db, id, id)).toEqual({ ok: false, error: "PROPIO" });
    const cliente = await conDosFactores(null);
    expect(await quitarDosFactores(db, cliente, "admin")).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
    await quitarDosFactores(db, id, "admin");
    expect(await quitarDosFactores(db, id, "admin")).toEqual({
      ok: false,
      error: "SIN_DOS_FACTORES",
    });
  });
});
