import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { ventanasDeRenovacion } from "@/domain/procesos/calendario";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { procesoRenovacion } from "../procesos/renovacion";
import { cambiarEstadoTicket, crearTicket, esquemaTicket, listarTickets } from "./tickets";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

const entrada = (codigo: string, extra: Partial<Record<string, unknown>> = {}) =>
  esquemaTicket.parse({
    codigo,
    porcentaje: "50",
    tope: "30000",
    vigenteDesde: "2026-01-01",
    vigenteHasta: "2026-12-31",
    paquetes: [],
    ...extra,
  });

describe("tickets", () => {
  it("valida los datos y no repite códigos", async () => {
    expect(esquemaTicket.safeParse({ ...entrada("OK-1"), porcentaje: "0" }).success).toBe(false);
    expect(
      esquemaTicket.safeParse({
        codigo: "FECHAS",
        porcentaje: "10",
        tope: "100",
        vigenteDesde: "2026-05-01",
        vigenteHasta: "2026-04-01",
        paquetes: [],
      }).success,
    ).toBe(false);
    expect((await crearTicket(db, entrada("bienvenida"), "actor")).ok).toBe(true);
    expect(await crearTicket(db, entrada("BIENVENIDA"), "actor")).toEqual({
      ok: false,
      error: "CODIGO_EXISTENTE",
    });
  });

  it("se puede desactivar", async () => {
    const r = await crearTicket(db, entrada("PAUSA-1"), "actor");
    if (!r.ok) throw new Error();
    await cambiarEstadoTicket(db, r.id, false, "actor");
    const lista = await listarTickets(db);
    expect(lista.find((k) => k.id === r.id)?.activo).toBe(false);
  });
});

describe("tickets y renovaciones", () => {
  it("la renovación de una compra hecha con ticket no lleva descuento", async () => {
    const r = await crearTicket(db, entrada("SOLO-NUEVOS"), "actor");
    if (!r.ok) throw new Error();
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    await db
      .update(t.ordenes)
      .set({
        ticketId: r.id,
        ticketPorcentaje: porcentaje("50"),
        ticketDescuento: centavos("10000"),
      })
      .where(eq(t.ordenes.id, orden.id));
    const contrato = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "PRO-INICIAL",
        estado: "ACTIVO",
        desde: fecha("2026-10-01"),
        hasta: fecha("2026-10-31"),
      },
    );

    await procesoRenovacion(db, ventanasDeRenovacion(fecha("2026-10-11")).at(-1)!);
    const nuevo = await db.query.contratos.findFirst({
      where: eq(t.contratos.contratoAnteriorId, contrato.id),
    });
    const renovacion = await db.query.ordenes.findFirst({
      where: eq(t.ordenes.id, nuevo!.ordenId!),
    });
    expect(renovacion).toMatchObject({
      ticketId: null,
      ticketDescuento: 0n,
      subtotal: centavos("35000"),
    });

    // El total descontado del ticket es solo el de la compra original.
    const [listado] = (await listarTickets(db)).filter((k) => k.id === r.id);
    expect(listado?.descontado).toBe(centavos("10000"));
    expect(listado?.usos).toBe(1);
  });
});
