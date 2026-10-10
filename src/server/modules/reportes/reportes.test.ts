import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { rangoDeMeses } from "@/domain/reportes/periodos";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import {
  cobranzaPorMes,
  consumosPorEmpresa,
  consumosPorMes,
  empresasPorProducto,
  ordenesPendientes,
  vencimientos,
  ventasPorPaquete,
} from "./reportes";

const HOY = fecha("2031-06-15");
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

/** Orden con total y fechas controladas (hora de Argentina = UTC−3). */
async function orden(
  total: string,
  emitida: string,
  opciones: { pagada?: string; estado?: "PEND_PAGO" | "PAGADA" | "CANCELADA" } = {},
) {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  await db
    .update(t.ordenes)
    .set({
      total: centavos(total),
      emitidaEn: new Date(`${emitida}T12:00:00-03:00`),
      estado: opciones.estado ?? (opciones.pagada ? "PAGADA" : "PEND_PAGO"),
      pagadaEn: opciones.pagada ? new Date(`${opciones.pagada}T12:00:00-03:00`) : null,
    })
    .where(eq(t.ordenes.id, orden.id));
  return { empresa, orden };
}

describe("cobranza", () => {
  it("agrupa emitido, cobrado y pendiente por mes", async () => {
    await orden("1000", "2031-05-10", { pagada: "2031-06-02" });
    await orden("500", "2031-06-01");
    await orden("300", "2031-06-03", { estado: "CANCELADA" });
    // El 31/5 a las 23:30 de Argentina ya es 1/6 en UTC: cuenta en mayo.
    const { orden: tarde } = await orden("200", "2031-05-31");
    await db
      .update(t.ordenes)
      .set({ emitidaEn: new Date("2031-06-01T02:30:00Z") })
      .where(eq(t.ordenes.id, tarde.id));

    const filas = await cobranzaPorMes(db, ["2031-05", "2031-06"]);
    expect(filas).toEqual([
      {
        mes: "2031-05",
        ordenes: 2,
        emitido: centavos("1200"),
        cobrado: 0n,
        pendiente: centavos("200"),
      },
      {
        mes: "2031-06",
        ordenes: 1,
        emitido: centavos("500"),
        cobrado: centavos("1000"),
        pendiente: centavos("500"),
      },
    ]);
  });

  it("lista las impagas con su antigüedad", async () => {
    const pendientes = await ordenesPendientes(db, HOY);
    const de500 = pendientes.find((p) => p.total === centavos("500"));
    expect(de500?.dias).toBe(14);
    // De la más antigua a la más nueva.
    const dias = pendientes.map((p) => p.dias);
    expect([...dias].sort((a, b) => b - a)).toEqual(dias);
  });
});

describe("vencimientos", () => {
  it("muestra el estado de renovación de lo que vence y de lo vencido sin renovar", async () => {
    const crear = async (hasta: string, noRenovar = false) => {
      const { empresa, orden } = await crearEmpresaDePrueba(db);
      const c = await crearContratoDePrueba(
        db,
        { empresaId: empresa.id, ordenId: orden.id },
        {
          codigoPaquete: "PRO-INICIAL",
          estado: "ACTIVO",
          desde: fecha("2031-05-01"),
          hasta: fecha(hasta),
        },
      );
      if (noRenovar)
        await db.update(t.contratos).set({ noRenovar: true }).where(eq(t.contratos.id, c.id));
      return { empresa, orden, c };
    };
    const proximo = await crear("2031-06-30");
    const sinRenovar = await crear("2031-06-20", true);
    const vencido = await crear("2031-06-10");
    const lejano = await crear("2031-09-30");

    // Al "próximo" se le generó la orden de renovación (impaga).
    await crearContratoDePrueba(
      db,
      { empresaId: proximo.empresa.id, ordenId: proximo.orden.id },
      {
        codigoPaquete: "PRO-INICIAL",
        estado: "PEND_PAGO",
        desde: fecha("2031-07-01"),
        hasta: fecha("2031-07-31"),
      },
    ).then((r) =>
      db
        .update(t.contratos)
        .set({ contratoAnteriorId: proximo.c.id })
        .where(eq(t.contratos.id, r.id)),
    );

    const filas = await vencimientos(db, HOY);
    const estado = (id: string) => filas.find((f) => f.contratoId === id);
    expect(estado(proximo.c.id)).toMatchObject({ estado: "ORDEN_PENDIENTE", dias: 15 });
    expect(estado(sinRenovar.c.id)).toMatchObject({ estado: "NO_RENOVAR", dias: 5 });
    expect(estado(vencido.c.id)).toMatchObject({ estado: "SIN_ORDEN", dias: -5 });
    expect(estado(lejano.c.id)).toBeUndefined();
  });
});

describe("consumos, licencias y ventas", () => {
  it("resume consumos por mes y por empresa", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const consumo = (familia: string, creditos: number, dia: string, n: number) =>
      db.insert(t.consumos).values({
        empresaId: empresa.id,
        familia,
        sistema: "prueba",
        transaccionExterna: `r-${empresa.id}-${n}`,
        cantidad: creditos,
        factorCentesimos: 100,
        creditosSolicitados: creditos,
        creditosConsumidos: creditos,
        registradoEn: new Date(`${dia}T12:00:00-03:00`),
      });
    await consumo("notificaciones", 100, "2031-05-20", 1);
    await consumo("notificaciones", 50, "2031-06-02", 2);
    await consumo("cotizaciones", 7, "2031-06-03", 3);

    const porMes = await consumosPorMes(db, HOY, 2);
    expect(porMes).toEqual([
      { mes: "2031-05", familia: "notificaciones", creditos: 100, operaciones: 1 },
      { mes: "2031-06", familia: "cotizaciones", creditos: 7, operaciones: 1 },
      { mes: "2031-06", familia: "notificaciones", creditos: 50, operaciones: 1 },
    ]);
    const junio = await consumosPorEmpresa(db, "2031-06");
    expect(junio[0]).toMatchObject({
      empresaId: empresa.id,
      familia: "notificaciones",
      creditos: 50,
    });
  });

  it("cuenta empresas por producto y ventas por paquete", async () => {
    const productos = await empresasPorProducto(db, HOY);
    // Los contratos del test de vencimientos siguen vigentes el 15/6.
    expect(productos.find((p) => p.productoId === "prodigal")?.empresas).toBeGreaterThanOrEqual(3);

    const { empresa, orden: o } = await orden("0", "2031-06-01");
    const c = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: o.id },
      { codigoPaquete: "NOTI-10K", estado: "ACTIVO", desde: fecha("2031-06-01"), hasta: null },
    );
    await db.insert(t.ordenItems).values({
      ordenId: o.id,
      contratoId: c.id,
      descripcion: "Notificaciones",
      precioLista: centavos("30000"),
      bonificacion: 0n,
      precioFinal: centavos("30000"),
      totalProrrateado: centavos("36300"),
    });
    const ventas = await ventasPorPaquete(db, rangoDeMeses(undefined, undefined, HOY).rango);
    expect(ventas.find((v) => v.paquete === "Notificaciones 10.000")).toMatchObject({
      altas: 1,
      renovaciones: 0,
      facturado: centavos("36300"),
    });
  });
});
