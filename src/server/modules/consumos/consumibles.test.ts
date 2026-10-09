import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { procesoDiario } from "../procesos/diario";
import { consumir, esBloqueoOcupado, type PedidoConsumo } from "./consumir";
import { reintegrar } from "./reintegrar";

const HOY = fecha("2026-09-15");
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

/**
 * Empresa con BienSeguro vigente (cupo de 1.000 notificaciones por mes) y un
 * paquete de 10.000 notificaciones prepagas.
 */
async function empresa(opciones: { conBienSeguro?: boolean } = {}) {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  const ctx = { empresaId: empresa.id, ordenId: orden.id };
  const cupo =
    opciones.conBienSeguro === false
      ? undefined
      : await crearContratoDePrueba(db, ctx, {
          codigoPaquete: "BS-BASE",
          estado: "ACTIVO",
          desde: fecha("2026-09-01"),
          hasta: fecha("2026-09-30"),
        });
  const prepago = await crearContratoDePrueba(db, ctx, {
    codigoPaquete: "NOTI-10K",
    estado: "ACTIVO",
    desde: fecha("2026-09-01"),
    hasta: null,
  });
  await db.insert(t.movimientosSaldo).values({
    contratoId: prepago.id,
    recursoId: "notificaciones.saldo",
    clase: "SALDO",
    tipo: "CARGA",
    creditos: 10000,
  });
  return { empresa, cupo, prepago };
}

const pedido = (empresaNumero: number, parcial: Partial<PedidoConsumo> = {}): PedidoConsumo => ({
  sistema: "bienseguro",
  empresaNumero,
  familia: "notificaciones",
  cantidad: 100,
  modo: "PARCIAL",
  transaccion: crypto.randomUUID(),
  ...parcial,
});

const saldoDe = async (contratoId: string) =>
  (
    await db.query.contratoRecursos.findFirst({
      where: and(
        eq(t.contratoRecursos.contratoId, contratoId),
        eq(t.contratoRecursos.recursoId, "notificaciones.saldo"),
      ),
    })
  )?.saldo;

const renovacionDe = (contratoId: string) =>
  db.query.contratos.findFirst({ where: eq(t.contratos.contratoAnteriorId, contratoId) });

describe("servicio de consumibles", () => {
  it("cada sistema pide lo suyo y solo con su producto vivo", async () => {
    const { empresa: e } = await empresa();
    expect(
      await consumir(db, pedido(e.numero, { sistema: "prodigal", familia: "cotizaciones" }), HOY),
    ).toMatchObject({ ok: false, error: "TIPO_NO_HABILITADO" });
    // Prodigal no está vigente para esta empresa (solo BienSeguro).
    expect(await consumir(db, pedido(e.numero, { sistema: "prodigal" }), HOY)).toMatchObject({
      ok: false,
      error: "PRODUCTO_NO_VIVO",
    });
    // Una integración propia de la empresa no se controla por producto.
    expect(await consumir(db, pedido(e.numero, { sistema: "integracion" }), HOY)).toMatchObject({
      ok: true,
      valor: { resultado: "OK" },
    });
  });

  it("si no alcanza responde PARCIAL o SIN_SALDO y avisa una vez por día", async () => {
    const { empresa: e } = await empresa();
    expect(
      await consumir(db, pedido(e.numero, { cantidad: 20_000, modo: "TODO_O_NADA" }), HOY),
    ).toMatchObject({ ok: true, valor: { resultado: "SIN_SALDO", consumido: 0 } });
    expect(await consumir(db, pedido(e.numero, { cantidad: 20_000 }), HOY)).toMatchObject({
      ok: true,
      valor: { resultado: "PARCIAL", consumido: 11_000 },
    });
    const avisos = await db.query.alertas.findMany({
      where: and(eq(t.alertas.empresaId, e.id), eq(t.alertas.tipo, "CONSUMIBLE_SIN_SALDO")),
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ paraCliente: true, paraSofteam: true });
  });

  it("detecta el bloqueo ocupado de otro pedido en curso", () => {
    expect(esBloqueoOcupado({ cause: { code: "55P03" } })).toBe(true);
    expect(esBloqueoOcupado(new Error("otro"))).toBe(false);
  });
});

describe("renovación por saldo", () => {
  it("con el 10 % o menos genera el mismo paquete en una orden propia, una sola vez", async () => {
    const { empresa: e, prepago } = await empresa();
    // 1.000 del cupo y 9.000 del prepago: le quedan 1.000 (10 %).
    await consumir(db, pedido(e.numero, { cantidad: 10_000 }), HOY);
    expect(await saldoDe(prepago.id)).toBe(1000);

    const nuevo = await renovacionDe(prepago.id);
    expect(nuevo).toMatchObject({
      tipoAccion: "RENOVACION",
      tipoPaquete: "CONSUMIBLE",
      estado: "PEND_PAGO",
      hasta: null,
      diaVenc: null,
    });
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, nuevo!.ordenId!) });
    expect(orden).toMatchObject({ estado: "PEND_PAGO", tipoGeneracion: "RENOVACION" });
    const aviso = await db.query.alertas.findFirst({
      where: and(eq(t.alertas.contratoId, nuevo!.id), eq(t.alertas.tipo, "RENOVACION_CONSUMIBLE")),
    });
    expect(aviso).toMatchObject({ paraCliente: true, paraSofteam: false });

    // Otro consumo y el control diario no la repiten.
    await consumir(db, pedido(e.numero, { cantidad: 10 }), HOY);
    await procesoDiario(db, HOY);
    expect(await db.$count(t.contratos, eq(t.contratos.contratoAnteriorId, prepago.id))).toBe(1);
  });

  it("no renueva sin la marca de renovación automática ni sin un producto vivo", async () => {
    const sinMarca = await empresa();
    await db
      .update(t.contratos)
      .set({ noRenovar: true })
      .where(eq(t.contratos.id, sinMarca.prepago.id));
    await consumir(db, pedido(sinMarca.empresa.numero, { cantidad: 10_000 }), HOY);
    expect(await renovacionDe(sinMarca.prepago.id)).toBeUndefined();

    const sinProducto = await empresa({ conBienSeguro: false });
    await consumir(
      db,
      pedido(sinProducto.empresa.numero, { sistema: "integracion", cantidad: 9_500 }),
      HOY,
    );
    expect(await saldoDe(sinProducto.prepago.id)).toBe(500);
    expect(await renovacionDe(sinProducto.prepago.id)).toBeUndefined();
  });
});

describe("reintegro", () => {
  it("vuelve al consumible si tiene lugar y el resto al cupo del que salió", async () => {
    const { empresa: e, cupo, prepago } = await empresa();
    // 1.000 del cupo y 200 del prepago.
    const origen = pedido(e.numero, { cantidad: 1200, transaccion: "envio-1" });
    await consumir(db, origen, HOY);
    const devolver = {
      sistema: "bienseguro",
      empresaNumero: e.numero,
      familia: "notificaciones" as const,
      cantidad: 300,
      transaccion: "reintegro-1",
      transaccionOrigen: "envio-1",
    };
    expect(await reintegrar(db, devolver)).toEqual({
      ok: true,
      valor: {
        transaccion: "reintegro-1",
        transaccionOrigen: "envio-1",
        cantidad: 300,
        creditos: 300,
        repetido: false,
      },
    });
    expect(await saldoDe(prepago.id)).toBe(10_000);
    const alCupo = await db.query.movimientosSaldo.findFirst({
      where: and(
        eq(t.movimientosSaldo.contratoId, cupo!.id),
        eq(t.movimientosSaldo.tipo, "REINTEGRO"),
      ),
    });
    expect(alCupo).toMatchObject({ creditos: 100, periodo: "2026-09" });

    // Idempotente, y nunca más de lo entregado.
    expect(await reintegrar(db, devolver)).toMatchObject({ ok: true, valor: { repetido: true } });
    expect(
      await reintegrar(db, { ...devolver, transaccion: "reintegro-2", cantidad: 901 }),
    ).toMatchObject({ ok: false, error: "REINTEGRO_EXCEDE" });
    expect(
      await reintegrar(db, { ...devolver, transaccion: "reintegro-3", cantidad: 900 }),
    ).toMatchObject({ ok: true });
    expect(
      await reintegrar(db, { ...devolver, transaccion: "reintegro-4", transaccionOrigen: "nada" }),
    ).toMatchObject({ ok: false, error: "ORIGEN_INEXISTENTE" });
    expect(
      await reintegrar(db, { ...devolver, transaccion: "envio-1", cantidad: 1 }),
    ).toMatchObject({ ok: false, error: "TRANSACCION_DUPLICADA" });
  });
});
