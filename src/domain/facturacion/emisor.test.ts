import { describe, expect, it } from "vitest";
import {
  type EmisorParaVenta,
  medioDisponibleParaEmisor,
  NUMERO_FACTURA_MANUAL,
  resolverEmisor,
} from "./emisor";

const emisor = (parcial: Partial<EmisorParaVenta> = {}): EmisorParaVenta => ({
  id: "e1",
  activo: true,
  mercadoPago: true,
  ...parcial,
});

describe("emisores", () => {
  it("el emisor es el del cliente o, si no tiene o está dado de baja, el preferido del país", () => {
    const delCliente = emisor({ id: "cliente" });
    const preferido = emisor({ id: "preferido" });
    expect(resolverEmisor(delCliente, preferido)).toMatchObject({ valor: { id: "cliente" } });
    expect(resolverEmisor(undefined, preferido)).toMatchObject({ valor: { id: "preferido" } });
    expect(resolverEmisor(emisor({ activo: false }), preferido)).toMatchObject({
      valor: { id: "preferido" },
    });
    expect(resolverEmisor(undefined, undefined)).toMatchObject({ ok: false, error: "SIN_EMISOR" });
  });

  it("sin conexión con Mercado Pago no se ofrecen sus medios", () => {
    const sinMp = emisor({ mercadoPago: false });
    expect(medioDisponibleParaEmisor("LINK_MP", sinMp)).toBe(false);
    expect(medioDisponibleParaEmisor("SUSCRIPCION_MP", sinMp)).toBe(false);
    expect(medioDisponibleParaEmisor("TRANSFERENCIA", sinMp)).toBe(true);
    expect(medioDisponibleParaEmisor("LINK_MP", emisor())).toBe(true);
  });

  it("número de una factura emitida fuera del sistema", () => {
    expect(NUMERO_FACTURA_MANUAL.test("A-0001-00001234")).toBe(true);
    expect(NUMERO_FACTURA_MANUAL.test("B-00012-00000001")).toBe(true);
    expect(NUMERO_FACTURA_MANUAL.test("A 0001 1234")).toBe(false);
  });
});
