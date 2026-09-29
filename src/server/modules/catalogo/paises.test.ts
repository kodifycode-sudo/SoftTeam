import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import {
  esquemaMoneda,
  esquemaPais,
  esquemaProvincia,
  guardarMoneda,
  guardarPais,
  guardarProvincia,
  listarPaises,
  nombresDeProvincias,
  provinciaValida,
} from "./paises";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

const moneda = (cambios: Record<string, unknown> = {}) =>
  esquemaMoneda.parse({
    codigo: "uyu",
    nombre: "Peso uruguayo",
    simbolo: "$U",
    cotizacion: "25,5",
    activa: true,
    ...cambios,
  });

const pais = (cambios: Record<string, unknown> = {}) =>
  esquemaPais.parse({
    id: "uy",
    nombre: "Uruguay",
    nombreCorto: "UY",
    prefijoTelefonico: "598",
    moneda: "UYU",
    alicuotaIvaGeneral: "22",
    activo: true,
    ...cambios,
  });

describe("países, monedas y provincias", () => {
  it("la carga inicial trae el peso, el dólar y las 24 provincias de Argentina", async () => {
    expect(await nombresDeProvincias(db, "AR")).toHaveLength(24);
    expect(await provinciaValida(db, "AR", "Córdoba")).toBe(true);
    const ars = await db.query.monedas.findFirst({ where: eq(t.monedas.codigo, "ARS") });
    expect(Number(ars?.cotizacion)).toBe(1);
  });

  it("monedas: cotización con fecha, el peso no se desactiva, una en uso tampoco", async () => {
    expect(esquemaMoneda.safeParse({ ...moneda(), cotizacion: "0" }).success).toBe(false);
    expect(await guardarMoneda(db, moneda(), "admin")).toEqual({ ok: true });
    const uyu = await db.query.monedas.findFirst({ where: eq(t.monedas.codigo, "UYU") });
    expect(Number(uyu?.cotizacion)).toBe(25.5);
    expect(uyu?.cotizacionEn).toBeInstanceOf(Date);

    expect(
      await guardarMoneda(
        db,
        moneda({ codigo: "ARS", nombre: "Peso argentino", simbolo: "$", activa: false }),
        "admin",
      ),
    ).toEqual({ ok: false, error: "MONEDA_BASE" });
    // El peso siempre vale 1, aunque se cargue otra cotización.
    await guardarMoneda(
      db,
      moneda({ codigo: "ARS", nombre: "Peso argentino", simbolo: "$", cotizacion: "3" }),
      "admin",
    );
    const ars = await db.query.monedas.findFirst({ where: eq(t.monedas.codigo, "ARS") });
    expect(Number(ars?.cotizacion)).toBe(1);

    await guardarPais(db, pais(), "admin");
    expect(await guardarMoneda(db, moneda({ activa: false }), "admin")).toEqual({
      ok: false,
      error: "EN_USO",
    });
  });

  it("países: moneda activa y siempre uno activo", async () => {
    expect(await guardarPais(db, pais({ id: "CL", moneda: "CLP" }), "admin")).toEqual({
      ok: false,
      error: "MONEDA_INVALIDA",
    });
    const uy = (await listarPaises(db)).find((p) => p.id === "UY");
    expect(uy).toMatchObject({ nombre: "Uruguay", moneda: "UYU", activo: true, provincias: 0 });

    await guardarPais(db, pais({ activo: false }), "admin");
    const argentina = pais({
      id: "AR",
      nombre: "Argentina",
      nombreCorto: "AR",
      prefijoTelefonico: "54",
      moneda: "ARS",
      alicuotaIvaGeneral: "21",
      activo: false,
    });
    expect(await guardarPais(db, argentina, "admin")).toEqual({
      ok: false,
      error: "ULTIMO_ACTIVO",
    });
  });

  it("provincias: sin repetir código ni nombre; una inactiva deja de valer", async () => {
    const montevideo = esquemaProvincia.parse({
      paisId: "UY",
      codigo: "mo",
      nombre: "Montevideo",
      activa: true,
    });
    expect(await guardarProvincia(db, montevideo, "admin")).toEqual({ ok: true });
    expect(await guardarProvincia(db, { ...montevideo, codigo: "MV" }, "admin")).toEqual({
      ok: false,
      error: "REPETIDA",
    });
    expect(await provinciaValida(db, "UY", "Montevideo")).toBe(true);
    // Es de Uruguay, no de Argentina.
    expect(await provinciaValida(db, "AR", "Montevideo")).toBe(false);

    const [fila] = await db.select().from(t.provincias).where(eq(t.provincias.codigo, "MO"));
    await guardarProvincia(db, { ...montevideo, id: fila!.id, activa: false }, "admin");
    expect(await provinciaValida(db, "UY", "Montevideo")).toBe(false);
  });
});
