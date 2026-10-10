import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { rangoDeDias } from "@/domain/reportes/periodos";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { crearTicket, esquemaTicket } from "../catalogo/tickets";
import {
  bonificacionesOtorgadas,
  consumiblesRenovados,
  pedidosSinSaldo,
  renovacionesPorMes,
  resumenTickets,
  seriesDeTickets,
  trimestresIniciales,
} from "./comerciales";

const HOY = fecha("2032-06-15");
const rango = (desde: string, hasta: string) => rangoDeDias(desde, hasta, HOY).rango;
const instante = (dia: string) => new Date(`${dia}T15:00:00Z`);
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

describe("tickets", () => {
  it("resume usos y descuentos, y el saldo de cada serie", async () => {
    const ticket = await crearTicket(
      db,
      esquemaTicket.parse({
        codigo: "SERIE-REPORTE",
        porcentaje: "10",
        tope: "1000",
        minimo: "0",
        uso: "MULTIPLE",
        usosMaximos: 0,
        vigenteDesde: "2032-01-01",
        vigenteHasta: "2032-12-31",
        paquetes: [],
        altaInicial: true,
        adicional: true,
        renovacion: true,
        publico: true,
      }),
      "actor",
    );
    if (!ticket.ok) throw new Error();
    const { empresa, cliente, orden } = await crearEmpresaDePrueba(db);
    await db
      .update(t.ordenes)
      .set({
        ticketId: ticket.id,
        ticketDescuento: centavos("400"),
        emitidaEn: instante("2032-02-10"),
      })
      .where(eq(t.ordenes.id, orden.id));
    // La renovación que hereda el ticket.
    await db.insert(t.ordenes).values({
      ...(({ id: _i, numero: _n, claveIdempotencia: _c, ...resto }) => resto)(orden),
      empresaId: empresa.id,
      clienteId: cliente.id,
      tipoGeneracion: "RENOVACION",
      ordenOrigenId: orden.id,
      ticketId: ticket.id,
      ticketDescuento: centavos("600"),
      emitidaEn: instante("2032-03-10"),
      claveIdempotencia: crypto.randomUUID(),
    });

    const resumen = await resumenTickets(db, rango("2032-01-01", "2032-12-31"));
    expect(resumen.find((r) => r.codigo === "SERIE-REPORTE")).toMatchObject({
      usos: 1,
      renovaciones: 1,
      descontado: centavos("1000"),
    });
    const series = await seriesDeTickets(db, rango("2032-01-01", "2032-12-31"), HOY);
    expect(series.find((s) => s.codigo === "SERIE-REPORTE")).toMatchObject({
      renovaciones: 1,
      descontado: centavos("1000"),
      saldo: 0n,
      estado: "AGOTADA",
      vence: "2033-02-10",
    });
  });
});

describe("bonificaciones", () => {
  it("lista los paquetes bonificados con motivo y lo bonificado", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    await db
      .update(t.ordenes)
      .set({ emitidaEn: instante("2032-04-05") })
      .where(eq(t.ordenes.id, orden.id));
    const contrato = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      { codigoPaquete: "NOTI-10K", estado: "ACTIVO", desde: fecha("2032-04-05"), hasta: null },
    );
    await db
      .update(t.contratos)
      .set({
        bonifPorcentaje: porcentaje("20"),
        bonifRecurrente: true,
        bonifMotivo: "Cliente fiel",
      })
      .where(eq(t.contratos.id, contrato.id));
    await db.insert(t.ordenItems).values({
      ordenId: orden.id,
      contratoId: contrato.id,
      descripcion: "Notificaciones",
      precioLista: centavos("30000"),
      bonificacion: centavos("6000"),
      precioFinal: centavos("24000"),
      totalProrrateado: centavos("29040"),
    });
    const filas = await bonificacionesOtorgadas(db, rango("2032-04-01", "2032-04-30"));
    expect(filas).toEqual([
      expect.objectContaining({
        contratoId: contrato.id,
        porcentaje: porcentaje("20"),
        recurrente: true,
        motivo: "Cliente fiel",
        bonificado: centavos("6000"),
      }),
    ]);
  });
});

describe("renovaciones", () => {
  it("agrupa las automáticas por mes, con su estado y los días proporcionales", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    await db
      .update(t.ordenes)
      .set({ tipoGeneracion: "RENOVACION", estado: "PAGADA", emitidaEn: instante("2032-05-02") })
      .where(eq(t.ordenes.id, orden.id));
    const contrato = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "PRO-INICIAL",
        estado: "ACTIVO",
        desde: fecha("2032-05-03"),
        hasta: fecha("2032-06-10"),
      },
    );
    await db
      .update(t.contratos)
      .set({ prorrataDias: 8, prorrataImporte: centavos("9000") })
      .where(eq(t.contratos.id, contrato.id));
    const [abril, mayo] = await renovacionesPorMes(db, ["2032-04", "2032-05"]);
    expect(abril).toMatchObject({ ordenes: 0, pagadas: 0 });
    expect(mayo).toMatchObject({
      ordenes: 1,
      pagadas: 1,
      impagas: 0,
      diasProporcionales: 8,
      proporcional: centavos("9000"),
    });
  });

  it("muestra los trimestres iniciales del período, negociados o no", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    const sinNegociar = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "PRO-INICIAL",
        estado: "ACTIVO",
        desde: fecha("2032-04-01"),
        hasta: fecha("2032-06-30"),
        diaVenc: null,
      },
    );
    const negociado = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "CW-PRO",
        estado: "ACTIVO",
        desde: fecha("2032-04-01"),
        hasta: fecha("2032-06-20"),
        diaVenc: null,
      },
    );
    const renovacion = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "CW-PRO",
        estado: "PEND_PAGO",
        desde: fecha("2032-06-21"),
        hasta: fecha("2032-07-10"),
      },
    );
    await db
      .update(t.contratos)
      .set({ contratoAnteriorId: negociado.id })
      .where(eq(t.contratos.id, renovacion.id));
    const filas = await trimestresIniciales(db, rango("2032-06-01", "2032-06-30"));
    expect(filas.find((f) => f.contratoId === sinNegociar.id)?.renovacion).toBeNull();
    expect(filas.find((f) => f.contratoId === negociado.id)?.renovacion).toBe(orden.numero);
  });
});

describe("consumibles", () => {
  it("renovados por saldo y pedidos que no alcanzaron, por empresa", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    const renovado = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      { codigoPaquete: "NOTI-10K", estado: "PEND_PAGO", desde: null, hasta: null },
    );
    await db
      .update(t.contratos)
      .set({ tipoAccion: "RENOVACION", creadoEn: instante("2032-05-20") })
      .where(eq(t.contratos.id, renovado.id));
    for (const [resultado, consumido] of [
      ["PARCIAL", 50],
      ["SIN_SALDO", 0],
      ["OK", 100],
    ] as const) {
      await db.insert(t.consumos).values({
        empresaId: empresa.id,
        familia: "notificaciones",
        sistema: "bienseguro",
        transaccionExterna: crypto.randomUUID(),
        cantidad: 100,
        factorCentesimos: 100,
        creditosSolicitados: 100,
        creditosConsumidos: consumido,
        resultado,
        registradoEn: instante("2032-05-21"),
      });
    }
    const mayo = rango("2032-05-01", "2032-05-31");
    expect((await consumiblesRenovados(db, mayo)).map((c) => c.contratoId)).toContain(renovado.id);
    expect((await pedidosSinSaldo(db, mayo)).find((p) => p.empresaId === empresa.id)).toMatchObject(
      { familia: "notificaciones", parciales: 1, sinSaldo: 1, solicitado: 200, entregado: 50 },
    );
  });
});
