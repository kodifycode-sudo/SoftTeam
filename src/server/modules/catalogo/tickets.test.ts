import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { ventanasDeRenovacion } from "@/domain/procesos/calendario";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { procesoRenovacion } from "../procesos/renovacion";
import { registrarPago } from "../ventas/ordenes";
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

describe("ticket en serie en las renovaciones", () => {
  it("descuenta hasta agotar el tope, con el remanente al final", async () => {
    const r = await crearTicket(db, entrada("SERIE-50"), "actor");
    if (!r.ok) throw new Error();
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    // La orden original ya usó 10.000 del tope de 30.000.
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

    // Renueva, paga y vuelve a renovar, tres veces.
    const descuentos: bigint[] = [];
    let anterior = contrato.id;
    for (const corte of ["2026-09-15", "2026-10-15", "2026-11-15"] as const) {
      await procesoRenovacion(db, ventanasDeRenovacion(fecha(corte)).at(-1)!);
      const nuevo = await db.query.contratos.findFirst({
        where: eq(t.contratos.contratoAnteriorId, anterior),
      });
      if (!nuevo) throw new Error(`No se renovó en ${corte}`);
      const o = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, nuevo.ordenId) });
      descuentos.push(o?.ticketDescuento ?? 0n);
      expect(o?.ordenOrigenId).toBe(orden.id);
      await registrarPago(db, nuevo.ordenId, "actor", nuevo.desde!);
      anterior = nuevo.id;
    }
    // 50 % de 35.000 = 17.500; después queda un remanente de 2.500; después, nada.
    expect(descuentos).toEqual([centavos("17500"), centavos("2500"), 0n]);

    const [listado] = (await listarTickets(db)).filter((k) => k.id === r.id);
    expect(listado?.consumido).toBe(centavos("30000"));
    expect(listado?.usos).toBe(1);
  });
});
