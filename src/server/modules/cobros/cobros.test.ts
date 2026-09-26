import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import { crearFacturadorSimulado, type Facturador } from "@/server/cobros/facturador";
import { crearMercadoPago, firmaDeNotificacionValida } from "@/server/cobros/mercadopago";
import {
  avisoSimulado,
  CABECERA_FIRMA_SIMULADOR,
  crearPagoSimulado,
  crearSimulador,
} from "@/server/cobros/simulador";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { facturarOrden, facturarPendientes } from "./facturacion";
import { obtenerLinkDePago, procesarPago, reenviarLinkDePago } from "./pagos";

const SECRETO = "secreto-de-prueba";
const BASE = "https://stlic.test";
const simulador = crearSimulador(SECRETO, BASE);
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

/** Orden pendiente con link de pago y un contrato por activar. */
async function ordenConLink(total = 121_000n) {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  const [link] = await db.select().from(t.mediosPago).where(eq(t.mediosPago.codigo, "LINK_MP"));
  await db
    .update(t.ordenes)
    .set({ medioPagoId: link!.id, total })
    .where(eq(t.ordenes.id, orden.id));
  const contrato = await crearContratoDePrueba(
    db,
    { empresaId: empresa.id, ordenId: orden.id },
    { codigoPaquete: "PRO-INICIAL", estado: "PEND_PAGO", desde: null, hasta: null },
  );
  return { empresa, orden: { ...orden, total }, contrato };
}

describe("simulador de pagos", () => {
  it("firma los pagos y los avisos: no se pueden fabricar", async () => {
    const id = crearPagoSimulado(SECRETO, {
      ordenId: "11111111-1111-4111-8111-111111111111",
      estado: "APROBADO",
      monto: 5000n,
      moneda: "ARS",
    });
    expect(await simulador.obtenerPago(id)).toMatchObject({ estado: "APROBADO", monto: 5000n });
    const falso = crearPagoSimulado("otro-secreto", {
      ordenId: "11111111-1111-4111-8111-111111111111",
      estado: "APROBADO",
      monto: 5000n,
      moneda: "ARS",
    });
    expect(await simulador.obtenerPago(falso)).toBeUndefined();

    const aviso = avisoSimulado(SECRETO, id);
    const headers = new Headers({ [CABECERA_FIRMA_SIMULADOR]: aviso.firma });
    expect(simulador.leerAviso({ url: BASE, headers, cuerpo: aviso.cuerpo })).toEqual({
      ok: true,
      valor: { pagoId: id },
    });
    expect(
      simulador.leerAviso({ url: BASE, headers, cuerpo: aviso.cuerpo.replace("payment", "x") }),
    ).toMatchObject({ ok: false, error: "FIRMA_INVALIDA" });
  });
});

describe("Mercado Pago", () => {
  const secreto = "clave-avisos-mp";
  const firma = (manifiesto: string) =>
    createHmac("sha256", secreto).update(manifiesto).digest("hex");

  it("valida la firma x-signature de las notificaciones", () => {
    const cabecera = `ts=1704908010,v1=${firma("id:123456;request-id:abc-1;ts:1704908010;")}`;
    expect(
      firmaDeNotificacionValida(secreto, { dataId: "123456", requestId: "abc-1", cabecera }),
    ).toBe(true);
    expect(
      firmaDeNotificacionValida(secreto, { dataId: "999", requestId: "abc-1", cabecera }),
    ).toBe(false);
    expect(
      firmaDeNotificacionValida(secreto, { dataId: "1", requestId: null, cabecera: null }),
    ).toBe(false);
  });

  it("crea la preferencia y traduce el pago", async () => {
    const pedidos: { url: string; init: RequestInit | undefined }[] = [];
    const fetchFalso = (async (url: string, init?: RequestInit) => {
      pedidos.push({ url, init });
      const cuerpo = url.endsWith("/checkout/preferences")
        ? { id: "pref-1", init_point: "https://mp.test/pagar/pref-1" }
        : {
            id: 42,
            status: "rejected",
            status_detail: "cc_rejected_insufficient_amount",
            external_reference: "orden-1",
            transaction_amount: 1210.5,
            currency_id: "ARS",
          };
      return new Response(JSON.stringify(cuerpo), { status: 200 });
    }) as typeof fetch;
    const mp = crearMercadoPago({ token: "TEST-token", secretoAvisos: secreto }, fetchFalso);

    const link = await mp.crearLink({
      ordenId: "orden-1",
      numero: 10001,
      descripcion: "Orden",
      total: 121_050n,
      moneda: "ARS",
      urlRetorno: `${BASE}/portal/ordenes/orden-1`,
      urlAviso: `${BASE}/api/pagos/aviso`,
    });
    expect(link).toEqual({ preferenciaId: "pref-1", url: "https://mp.test/pagar/pref-1" });
    const enviado = JSON.parse(String(pedidos[0]?.init?.body));
    expect(enviado).toMatchObject({
      external_reference: "orden-1",
      items: [{ unit_price: 1210.5, currency_id: "ARS" }],
    });

    expect(await mp.obtenerPago("42")).toEqual({
      id: "42",
      ordenId: "orden-1",
      estado: "RECHAZADO",
      monto: 121_050n,
      moneda: "ARS",
      detalle: "cc_rejected_insufficient_amount",
    });
    // Un id con formato inválido no llega a la API.
    expect(await mp.obtenerPago("../otra-cosa")).toBeUndefined();
  });
});

describe("cobro de una orden", () => {
  it("el link se crea una vez y se reutiliza", async () => {
    const { orden, empresa } = await ordenConLink();
    const primero = await obtenerLinkDePago(db, simulador, orden.id, {
      urlBase: BASE,
      alcance: { empresaId: empresa.id },
    });
    expect(primero).toEqual({ ok: true, url: `${BASE}/simulador/pago/${orden.id}` });
    const otra = await crearEmpresaDePrueba(db);
    expect(
      await obtenerLinkDePago(db, simulador, orden.id, {
        urlBase: BASE,
        alcance: { empresaId: otra.empresa.id },
      }),
    ).toEqual({ ok: false, error: "NO_EXISTE" });
    // Sin pasarela configurada, un link ya creado se sigue pudiendo usar.
    expect(await obtenerLinkDePago(db, null, orden.id, { urlBase: BASE })).toEqual(primero);
  });

  it("un pago aprobado activa la orden una sola vez", async () => {
    const { orden, contrato } = await ordenConLink();
    const pago = {
      id: "pago-aprobado-1",
      ordenId: orden.id,
      estado: "APROBADO" as const,
      monto: orden.total,
      moneda: "ARS",
    };
    expect(await procesarPago(db, pago, fecha("2026-10-01"))).toBe("APROBADO");
    expect(await procesarPago(db, pago, fecha("2026-10-01"))).toBe("YA_PROCESADO");
    const [activado] = await db.select().from(t.contratos).where(eq(t.contratos.id, contrato.id));
    expect(activado).toMatchObject({ estado: "ACTIVO", desde: "2026-10-01" });
    const [pagada] = await db.select().from(t.ordenes).where(eq(t.ordenes.id, orden.id));
    expect(pagada).toMatchObject({ estado: "PAGADA", mpPagoId: "pago-aprobado-1" });
  });

  it("un pago rechazado deja el error y avisa; después se puede pagar", async () => {
    const { orden, empresa } = await ordenConLink();
    const base = { ordenId: orden.id, monto: orden.total, moneda: "ARS" };
    expect(
      await procesarPago(db, { ...base, id: "rech-1", estado: "RECHAZADO", detalle: "Sin fondos" }),
    ).toBe("RECHAZADO");
    const [conError] = await db.select().from(t.ordenes).where(eq(t.ordenes.id, orden.id));
    expect(conError).toMatchObject({
      pagoError: true,
      pagoErrorDetalle: "Sin fondos",
      estado: "PEND_PAGO",
    });
    const alertas = await db.select().from(t.alertas).where(eq(t.alertas.empresaId, empresa.id));
    expect(alertas.map((a) => a.tipo)).toContain("PAGO_RECHAZADO");

    expect(await procesarPago(db, { ...base, id: "ok-2", estado: "APROBADO" })).toBe("APROBADO");
    const [pagada] = await db.select().from(t.ordenes).where(eq(t.ordenes.id, orden.id));
    expect(pagada).toMatchObject({ estado: "PAGADA", pagoError: false });
  });

  it("un importe distinto no activa: queda para revisión", async () => {
    const { orden, contrato } = await ordenConLink();
    expect(
      await procesarPago(db, {
        id: "corto-1",
        ordenId: orden.id,
        estado: "APROBADO",
        monto: orden.total - 100n,
        moneda: "ARS",
      }),
    ).toBe("A_REVISAR");
    const [revisar] = await db.select().from(t.ordenes).where(eq(t.ordenes.id, orden.id));
    expect(revisar).toMatchObject({ estado: "PEND_PAGO", requiereRevision: true });
    const [sigue] = await db.select().from(t.contratos).where(eq(t.contratos.id, contrato.id));
    expect(sigue?.estado).toBe("PEND_PAGO");
  });

  it("dos avisos simultáneos del mismo pago no se pisan", async () => {
    const { orden } = await ordenConLink();
    const pago = {
      id: "simultaneo-1",
      ordenId: orden.id,
      estado: "APROBADO" as const,
      monto: orden.total,
      moneda: "ARS",
    };
    const resultados = await Promise.all([procesarPago(db, pago), procesarPago(db, pago)]);
    expect(resultados.sort()).toEqual(["APROBADO", "YA_PROCESADO"]);
  });

  it("reenviar el link cuenta los reenvíos y avisa al cliente", async () => {
    const { orden, empresa } = await ordenConLink();
    expect(await reenviarLinkDePago(db, simulador, orden.id, "actor", BASE)).toEqual({
      ok: true,
      reenvios: 1,
    });
    await reenviarLinkDePago(db, simulador, orden.id, "actor", BASE);
    const avisos = await db.select().from(t.alertas).where(eq(t.alertas.empresaId, empresa.id));
    expect(avisos.filter((a) => a.tipo === "LINK_PAGO_REENVIADO")).toHaveLength(2);
    expect(avisos[0]?.mensaje).toContain(`${BASE}/simulador/pago/${orden.id}`);
  });
});

describe("facturación", () => {
  async function ordenPagada() {
    const { orden } = await ordenConLink();
    await procesarPago(db, {
      id: `pagada-${orden.id}`,
      ordenId: orden.id,
      estado: "APROBADO",
      monto: orden.total,
      moneda: "ARS",
    });
    return orden;
  }

  it("emite una vez por orden pagada", async () => {
    const orden = await ordenPagada();
    const facturador = crearFacturadorSimulado();
    const r = await facturarOrden(db, facturador, orden.id);
    expect(r).toEqual({
      estado: "EMITIDA",
      numero: `A 0001-${String(orden.numero).padStart(8, "0")}`,
    });
    expect(await facturarOrden(db, facturador, orden.id)).toEqual({ estado: "YA_FACTURADA" });
  });

  it("no factura órdenes impagas y dos procesos no emiten dos veces", async () => {
    const { orden: impaga } = await ordenConLink();
    expect(await facturarOrden(db, crearFacturadorSimulado(), impaga.id)).toEqual({
      estado: "NO_PAGADA",
    });

    const orden = await ordenPagada();
    let emisiones = 0;
    const lento: Facturador = {
      nombre: "simulador",
      async emitir(s) {
        emisiones++;
        await new Promise((r) => setTimeout(r, 50));
        return { comprobanteId: `x-${s.ordenId}`, numero: "A 1" };
      },
    };
    const resultados = await Promise.all([
      facturarOrden(db, lento, orden.id),
      facturarOrden(db, lento, orden.id),
    ]);
    expect(emisiones).toBe(1);
    expect(resultados.map((r) => r.estado).sort()).toEqual(["EMITIDA", "EN_CURSO"]);
  });

  it("si el facturador falla, libera la reserva y se reintenta", async () => {
    const orden = await ordenPagada();
    const caido: Facturador = {
      nombre: "simulador",
      async emitir() {
        throw new Error("Xubio no responde");
      },
    };
    await expect(facturarOrden(db, caido, orden.id)).rejects.toThrow("Xubio no responde");
    const r = await facturarPendientes(db, crearFacturadorSimulado());
    expect(r.emitidas).toBeGreaterThanOrEqual(1);
    const [facturada] = await db.select().from(t.ordenes).where(eq(t.ordenes.id, orden.id));
    expect(facturada?.facturaNumero).toMatch(/^A 0001-/);
  });
});

describe("ida y vuelta con el simulador", () => {
  it("procesa un id de pago real del simulador (largo, con motivo)", async () => {
    const { orden } = await ordenConLink();
    const id = crearPagoSimulado(SECRETO, {
      ordenId: orden.id,
      estado: "RECHAZADO",
      monto: orden.total,
      moneda: "ARS",
      detalle: "Fondos insuficientes (simulado)",
    });
    const pago = await simulador.obtenerPago(id);
    if (!pago) throw new Error();
    expect(await procesarPago(db, pago)).toBe("RECHAZADO");
    const [guardada] = await db.select().from(t.ordenes).where(eq(t.ordenes.id, orden.id));
    expect(guardada?.mpPagoId).toBe(id);
  });
});
