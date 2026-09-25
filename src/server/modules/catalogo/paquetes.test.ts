import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { type EntradaPaquete, esquemaPaquete, guardarPaquete, listarPaquetes } from "./paquetes";

let db: Db;
let actorId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  actorId = (await db.query.usuarios.findFirst())!.id;
});

const base = (parcial: Partial<EntradaPaquete> = {}): EntradaPaquete & { paisId: string } => ({
  codigo: "TEST-1",
  nombre: "Paquete de prueba",
  tipo: "TEMPORAL",
  privado: false,
  activo: true,
  ventaDesde: fecha("2026-01-01"),
  ventaHasta: null,
  recursos: { "prodigal.usuarios": 3 },
  alternativas: [
    {
      nombre: "Mensual",
      meses: 1,
      precioCompra: centavos("100"),
      precioRenovacion: centavos("90"),
      activa: true,
    },
  ],
  paisId: "AR",
  ...parcial,
});

describe("esquemaPaquete", () => {
  it("exige meses en temporales y los prohíbe en consumibles", () => {
    const entrada = {
      codigo: "x-1",
      nombre: "Algo",
      tipo: "CONSUMIBLE",
      privado: false,
      activo: true,
      ventaDesde: "2026-01-01",
      recursos: {},
      alternativas: [
        { nombre: "Única", meses: 3, precioCompra: "10", precioRenovacion: "10", activa: true },
      ],
    };
    const r = esquemaPaquete.safeParse(entrada);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["alternativas", 0, "meses"]);
    expect(
      esquemaPaquete.parse({
        ...entrada,
        alternativas: [{ ...entrada.alternativas[0], meses: null }],
      }).codigo,
    ).toBe("X-1");
  });
});

describe("guardarPaquete", () => {
  it("crea el paquete con recursos y alternativas", async () => {
    const r = await guardarPaquete(db, base(), actorId);
    expect(r.ok).toBe(true);
    const lista = await listarPaquetes(db, { hoy: fecha("2026-09-25"), busqueda: "TEST-1" });
    expect(lista[0]).toMatchObject({ codigo: "TEST-1", productos: ["prodigal"], vendible: true });
    expect(lista[0]?.alternativas[0]?.precioCompra).toBe(centavos("100"));
  });

  it("rechaza códigos duplicados", async () => {
    expect(await guardarPaquete(db, base(), actorId)).toEqual({
      ok: false,
      error: "CODIGO_DUPLICADO",
    });
  });

  it("no mezcla saldos prepagos con recursos temporales", async () => {
    const r = await guardarPaquete(
      db,
      base({ codigo: "MIX-1", recursos: { "prodigal.usuarios": 1, "notificaciones.saldo": 100 } }),
      actorId,
    );
    expect(r).toEqual({ ok: false, error: "RECURSO_INCOMPATIBLE" });
  });

  it("al quitar una alternativa la desactiva en lugar de borrarla", async () => {
    const creado = await guardarPaquete(
      db,
      base({
        codigo: "ALT-1",
        alternativas: [
          { nombre: "Mensual", meses: 1, precioCompra: 100n, precioRenovacion: 90n, activa: true },
          { nombre: "Anual", meses: 12, precioCompra: 1000n, precioRenovacion: 900n, activa: true },
        ],
      }),
      actorId,
    );
    if (!creado.ok) throw new Error(creado.error);
    const [mensual] = await db
      .select()
      .from(t.alternativas)
      .where(eq(t.alternativas.paqueteId, creado.id))
      .orderBy(t.alternativas.orden);

    await guardarPaquete(
      db,
      base({
        codigo: "ALT-1",
        alternativas: [
          {
            id: mensual!.id,
            nombre: "Mensual",
            meses: 1,
            precioCompra: 120n,
            precioRenovacion: 100n,
            activa: true,
          },
        ],
      }),
      actorId,
    ).then((r) => expect(r.ok).toBe(false)); // sin id: código duplicado

    const editado = await guardarPaquete(
      db,
      {
        ...base({
          codigo: "ALT-1",
          alternativas: [
            {
              id: mensual!.id,
              nombre: "Mensual",
              meses: 1,
              precioCompra: 120n,
              precioRenovacion: 100n,
              activa: true,
            },
          ],
        }),
        id: creado.id,
      },
      actorId,
    );
    expect(editado.ok).toBe(true);
    const alternativas = await db
      .select()
      .from(t.alternativas)
      .where(eq(t.alternativas.paqueteId, creado.id));
    expect(alternativas.find((a) => a.nombre === "Mensual")?.precioCompra).toBe(120n);
    expect(alternativas.find((a) => a.nombre === "Anual")?.activa).toBe(false);
  });
});
