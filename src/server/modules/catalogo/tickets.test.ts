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
    minimo: "0",
    uso: "MULTIPLE",
    usosMaximos: 0,
    altaInicial: true,
    adicional: true,
    renovacion: true,
    publico: true,
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
    // Nominado: el cliente tiene que existir y la situación quedar escrita.
    expect(esquemaTicket.safeParse({ ...entrada("NOMINADO"), cliente: "1" }).success).toBe(false);
    expect(
      await crearTicket(
        db,
        entrada("NOMINADO", { cliente: "999999", observaciones: "x" }),
        "actor",
      ),
    ).toEqual({
      ok: false,
      error: "CLIENTE_INEXISTENTE",
    });
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

describe("tickets y renovaciones (Mejora v2.1, 9.2 y 9.3)", () => {
  /** Compra con ticket (50 %, ya descontó $10.000) y su renovación automática. */
  async function renovarConTicket(codigo: string, tope: string, emitidaEn = "2026-09-01") {
    const r = await crearTicket(db, entrada(codigo, { tope }), "actor");
    if (!r.ok) throw new Error();
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    await db
      .update(t.ordenes)
      .set({
        ticketId: r.id,
        ticketPorcentaje: porcentaje("50"),
        ticketDescuento: centavos("10000"),
        emitidaEn: new Date(`${emitidaEn}T15:00:00Z`),
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
    return { ticketId: r.id, renovacion };
  }

  it("la renovación hereda el ticket y descuenta del saldo del tope", async () => {
    const { ticketId, renovacion } = await renovarConTicket("SERIE-1", "30000");
    // 50 % de $35.000 = $17.500; quedaban $20.000 del tope.
    expect(renovacion).toMatchObject({
      ticketId,
      ticketDescuento: centavos("17500"),
      subtotal: centavos("35000"),
    });
    const [listado] = (await listarTickets(db)).filter((k) => k.id === ticketId);
    expect(listado?.descontado).toBe(centavos("27500"));
    // La renovación es el mismo uso, no uno nuevo.
    expect(listado?.usos).toBe(1);
  });

  it("el último período aplica el remanente; agotado o pasado el año, sin descuento", async () => {
    const remanente = await renovarConTicket("SERIE-2", "12000");
    expect(remanente.renovacion).toMatchObject({ ticketDescuento: centavos("2000") });
    const agotado = await renovarConTicket("SERIE-3", "10000");
    expect(agotado.renovacion).toMatchObject({ ticketId: null, ticketDescuento: 0n });
    const vencido = await renovarConTicket("SERIE-4", "30000", "2025-09-01");
    expect(vencido.renovacion).toMatchObject({ ticketId: null, ticketDescuento: 0n });
  });
});
