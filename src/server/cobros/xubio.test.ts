import { describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import type { SolicitudFactura } from "./facturador";
import { crearXubio, desglosarIva } from "./xubio";

const CONFIG = { clientId: "id", secretId: "secreto", puntoVentaId: 7, productoId: 99 };

/** API de Xubio en memoria: registra los pedidos y responde según la ruta. */
function apiFalsa(opciones: { clientes?: unknown[]; facturas?: unknown[]; conCae?: boolean } = {}) {
  const pedidos: { metodo: string; ruta: string; cuerpo?: unknown; auth?: string }[] = [];
  const fetchFalso = (async (url: string | URL, init?: RequestInit) => {
    const ruta = String(url).replace("https://xubio.com/API/1.1", "");
    const metodo = init?.method ?? "GET";
    const cuerpo =
      typeof init?.body === "string" && init.body.startsWith("{")
        ? JSON.parse(init.body)
        : init?.body;
    const auth = new Headers(init?.headers).get("authorization") ?? undefined;
    pedidos.push({ metodo, ruta, cuerpo, auth });
    const json = (datos: unknown) => new Response(JSON.stringify(datos), { status: 200 });
    if (ruta === "/TokenEndpoint") return json({ access_token: "tok", expires_in: "3600" });
    if (ruta.startsWith("/comprobanteVentaBean?")) return json(opciones.facturas ?? []);
    if (ruta.startsWith("/clienteBean?")) return json(opciones.clientes ?? []);
    if (ruta === "/clienteBean") return json({ cliente_id: 555 });
    if (ruta === "/comprobanteVentaBean") {
      return json({
        transaccionid: 1234,
        numeroDocumento: "0007-00000042",
        ...(opciones.conCae ? { CAE: "74123456789012" } : {}),
      });
    }
    if (ruta === "/solicitarCAE") return json({ CAE: "74123456789012" });
    return new Response("no", { status: 404 });
  }) as typeof fetch;
  return { pedidos, fetchFalso };
}

const solicitud = (cambios: Partial<SolicitudFactura> = {}): SolicitudFactura => ({
  ordenId: "orden-1",
  numeroOrden: 10025,
  tipoComprobante: "A",
  fecha: "2026-09-29",
  cliente: { cuit: "30711111110", nombre: "Broker Sur SA", condicionIva: "RESPONSABLE_INSCRIPTO" },
  lineas: [
    {
      descripcion: "Prodigal Inicial · Mensual ×2",
      importe: centavos("76000"),
      total: centavos("91960"),
    },
    { descripcion: "Notificaciones 10.000", importe: centavos("30000"), total: centavos("36300") },
  ],
  alicuotaIva: porcentaje("21"),
  netoGravado: centavos("106000"),
  iva: centavos("22260"),
  total: centavos("128260"),
  moneda: "ARS",
  ...cambios,
});

describe("adaptador de Xubio", () => {
  it("separa neto e IVA de un total con IVA incluido, sin perder centavos", () => {
    expect(desglosarIva(centavos("121"), porcentaje("21"))).toEqual({
      neto: centavos("100"),
      iva: centavos("21"),
    });
    const { neto, iva } = desglosarIva(centavos("100.01"), porcentaje("21"));
    expect(neto + iva).toBe(centavos("100.01"));
  });

  it("crea el cliente si no existe, emite la factura con externalId y pide el CAE", async () => {
    const { pedidos, fetchFalso } = apiFalsa();
    const xubio = crearXubio(CONFIG, fetchFalso);
    expect(await xubio.emitir(solicitud())).toEqual({
      comprobanteId: "1234",
      numero: "A 0007-00000042",
    });

    expect(pedidos.map((p) => `${p.metodo} ${p.ruta.split("?")[0]}`)).toEqual([
      "POST /TokenEndpoint",
      "GET /comprobanteVentaBean",
      "GET /clienteBean",
      "POST /clienteBean",
      "POST /comprobanteVentaBean",
      "POST /solicitarCAE",
    ]);
    // El token se pide una sola vez y se usa como Bearer.
    expect(pedidos[1]?.auth).toBe("Bearer tok");
    expect(pedidos[3]?.cuerpo).toMatchObject({
      CUIT: "30711111110",
      categoriaFiscal: { codigo: "RI" },
    });
    const factura = pedidos[4]?.cuerpo as Record<string, unknown>;
    expect(factura).toMatchObject({
      externalId: "stlic-orden-1",
      tipo: 1,
      cliente: { ID: 555 },
      puntoVenta: { ID: 7 },
      fecha: "2026-09-29",
      condicionDePago: 2,
      importetotal: 128260,
    });
    expect(factura.transaccionProductoItems).toEqual([
      expect.objectContaining({ producto: { ID: 99 }, precio: 91960, importe: 76000, iva: 15960 }),
      expect.objectContaining({ precio: 36300, importe: 30000, iva: 6300 }),
    ]);
  });

  it("usa el código de Xubio del cliente y no pide el CAE si ya vino", async () => {
    const { pedidos, fetchFalso } = apiFalsa({ conCae: true });
    await crearXubio(CONFIG, fetchFalso).emitir(
      solicitud({ cliente: { ...solicitud().cliente, xubioId: "321" } }),
    );
    const rutas = pedidos.map((p) => p.ruta.split("?")[0]);
    expect(rutas).not.toContain("/clienteBean");
    expect(rutas).not.toContain("/solicitarCAE");
    expect((pedidos.at(-1)?.cuerpo as { cliente: unknown }).cliente).toMatchObject({ ID: 321 });
  });

  it("es idempotente: si la factura de la orden ya existe, la devuelve sin emitir otra", async () => {
    const { pedidos, fetchFalso } = apiFalsa({
      facturas: [
        { externalId: "otra", transaccionid: 1, numeroDocumento: "0007-00000001" },
        { externalId: "stlic-orden-1", transaccionid: 77, numeroDocumento: "A-0007-00000040" },
      ],
    });
    expect(await crearXubio(CONFIG, fetchFalso).emitir(solicitud())).toEqual({
      comprobanteId: "77",
      numero: "A-0007-00000040",
    });
    expect(pedidos.some((p) => p.metodo === "POST" && p.ruta === "/comprobanteVentaBean")).toBe(
      false,
    );
  });
});
