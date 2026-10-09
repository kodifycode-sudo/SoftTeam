import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import { limitesIntentos } from "@/server/db/schema";
import { ipDe, limpiarIntentos, registrarIntento } from "./intentos";

let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

const LIMITE = { max: 2, ventanaSegundos: 60 };
const T0 = Date.UTC(2026, 9, 9, 12);
const a = (segundos: number) => T0 + segundos * 1000;

describe("registrarIntento", () => {
  it("permite hasta el máximo en la ventana y después dice cuándo reintentar", async () => {
    const usos = [];
    for (const s of [0, 10, 20]) usos.push(await registrarIntento(db, "prueba:a", LIMITE, a(s)));
    expect(usos).toEqual([
      { permitido: true, reintentarEn: 0 },
      { permitido: true, reintentarEn: 0 },
      { permitido: false, reintentarEn: 40 },
    ]);
    // La ventana empieza con el primer intento: a los 60 s hay cupo nuevo.
    expect(await registrarIntento(db, "prueba:a", LIMITE, a(60))).toEqual({
      permitido: true,
      reintentarEn: 0,
    });
    expect(await registrarIntento(db, "prueba:a", LIMITE, a(70))).toMatchObject({
      permitido: true,
    });
    expect(await registrarIntento(db, "prueba:a", LIMITE, a(80))).toEqual({
      permitido: false,
      reintentarEn: 40,
    });
  });

  it("cada clave tiene su propio contador", async () => {
    await registrarIntento(db, "prueba:b", LIMITE, a(0));
    await registrarIntento(db, "prueba:b", LIMITE, a(1));
    expect((await registrarIntento(db, "prueba:b", LIMITE, a(2))).permitido).toBe(false);
    expect((await registrarIntento(db, "prueba:c", LIMITE, a(2))).permitido).toBe(true);
  });

  it("intentos simultáneos no se pisan: se cuentan todos", async () => {
    const usos = await Promise.all(
      Array.from({ length: 5 }, () => registrarIntento(db, "prueba:d", LIMITE, a(0))),
    );
    expect(usos.filter((u) => u.permitido)).toHaveLength(2);
  });
});

describe("limpiarIntentos", () => {
  it("borra solo los contadores propios de más de un día", async () => {
    const DIA = 24 * 60 * 60;
    await registrarIntento(db, "prueba:vieja", LIMITE, a(0));
    await registrarIntento(db, "prueba:nueva", LIMITE, a(DIA));
    // Las claves de Better Auth no son nuestras: no se tocan.
    await db
      .insert(limitesIntentos)
      .values({ id: "ajena", key: "127.0.0.1/sign-in/email", count: 1, lastRequest: a(0) });

    expect(await limpiarIntentos(db, a(DIA + 10))).toBeGreaterThanOrEqual(1);
    const quedan = async (key: string) =>
      (await db.select().from(limitesIntentos).where(eq(limitesIntentos.key, key))).length;
    expect(await quedan("stlic:prueba:vieja")).toBe(0);
    expect(await quedan("stlic:prueba:nueva")).toBe(1);
    expect(await quedan("127.0.0.1/sign-in/email")).toBe(1);
  });
});

describe("ipDe", () => {
  it("prefiere x-real-ip, luego el primero de x-forwarded-for", () => {
    expect(ipDe(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe(
      "1.1.1.1",
    );
    expect(ipDe(new Headers({ "x-forwarded-for": "2.2.2.2, 10.0.0.1" }))).toBe("2.2.2.2");
    expect(ipDe(new Headers())).toBe("local");
  });
});
