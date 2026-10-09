import { describe, expect, it } from "vitest";
import { centavos, porcentaje } from "../dinero";
import { calcularOrden, type EntradaCalculo, type ItemEntrada } from "./calculo-orden";

const item = (parcial: Partial<ItemEntrada> & Pick<ItemEntrada, "clave">): ItemEntrada => ({
  paqueteId: "pq",
  tipoAccion: "ALTA",
  cantidad: 1,
  precioCompra: centavos("100"),
  precioRenovacion: centavos("80"),
  bonifPorcentaje: 0n,
  moneda: "ARS",
  ...parcial,
});

const base = (parcial: Partial<EntradaCalculo> = {}): EntradaCalculo => ({
  moneda: "ARS",
  items: [item({ clave: "a" })],
  ajustePagoPorcentaje: 0n,
  alicuotaIva: porcentaje("21"),
  ...parcial,
});

function calcular(entrada: EntradaCalculo) {
  const r = calcularOrden(entrada);
  if (!r.ok) throw new Error(`Rechazo inesperado: ${r.error}`);
  return r.valor;
}

describe("calcularOrden — ejemplo numérico 2.6 del documento de mejora", () => {
  const r = calcular({
    moneda: "ARS",
    items: [
      item({
        clave: "prodigal",
        precioCompra: centavos("100000"),
        bonifPorcentaje: porcentaje("10"),
      }),
      item({ clave: "bienseguro", precioCompra: centavos("50000") }),
    ],
    ticket: { porcentaje: porcentaje("15"), tope: centavos("15000") },
    ajustePagoPorcentaje: porcentaje("8"),
    alicuotaIva: porcentaje("21"),
  });

  it("reproduce cada paso de la cascada", () => {
    expect(r.subtotalLista).toBe(centavos("150000"));
    expect(r.bonificacionTotal).toBe(centavos("10000"));
    expect(r.subtotal).toBe(centavos("140000"));
    expect(r.ticketDescuento).toBe(centavos("15000")); // 21.000 topeado por el saldo
    expect(r.baseNeta).toBe(centavos("125000"));
    expect(r.ajustePago).toBe(centavos("10000"));
    expect(r.netoGravado).toBe(centavos("135000"));
    expect(r.iva).toBe(centavos("28350"));
    expect(r.total).toBe(centavos("163350"));
  });

  it("prorratea el total exacto entre los ítems", () => {
    expect(r.items.map((i) => i.totalProrrateado)).toEqual([
      centavos("105010.71"),
      centavos("58339.29"),
    ]);
    expect(r.items.reduce((a, i) => a + i.totalProrrateado, 0n)).toBe(r.total);
  });
});

describe("calcularOrden — reglas", () => {
  it("la cantidad multiplica el precio (regresión N3: el wizard cobraba el unitario)", () => {
    const r = calcular(base({ items: [item({ clave: "a", cantidad: 3 })], alicuotaIva: 0n }));
    expect(r.subtotal).toBe(centavos("300"));
  });

  it("una renovación usa el precio de renovación", () => {
    const r = calcular(
      base({ items: [item({ clave: "a", tipoAccion: "RENOVACION" })], alicuotaIva: 0n }),
    );
    expect(r.subtotal).toBe(centavos("80"));
  });

  it("aplica la bonificación por medio de pago antes del IVA", () => {
    const r = calcular(base({ ajustePagoPorcentaje: porcentaje("-5") }));
    expect(r.ajustePago).toBe(centavos("-5"));
    expect(r.netoGravado).toBe(centavos("95"));
    expect(r.iva).toBe(centavos("19.95"));
    expect(r.total).toBe(centavos("114.95"));
  });

  it("el ticket nunca deja la base negativa", () => {
    const r = calcular(base({ ticket: { porcentaje: porcentaje("100"), tope: centavos("1000") } }));
    expect(r.baseNeta).toBe(0n);
    expect(r.total).toBe(0n);
  });

  it("un ítem bonificado al 100 % no rompe el prorrateo", () => {
    const r = calcular(
      base({
        items: [item({ clave: "a", bonifPorcentaje: porcentaje("100") }), item({ clave: "b" })],
      }),
    );
    expect(r.items.map((i) => i.totalProrrateado)).toEqual([0n, centavos("121")]);
  });

  it.each([
    ["SIN_ITEMS", base({ items: [] })],
    ["MONEDA_INCONSISTENTE", base({ items: [item({ clave: "a", moneda: "USD" })] })],
    ["CANTIDAD_INVALIDA", base({ items: [item({ clave: "a", cantidad: 0 })] })],
    ["CANTIDAD_INVALIDA", base({ items: [item({ clave: "a", cantidad: 1.5 })] })],
    [
      "BONIFICACION_INVALIDA",
      base({ items: [item({ clave: "a", bonifPorcentaje: porcentaje("101") })] }),
    ],
  ] as const)("rechaza %s", (codigo, entrada) => {
    const r = calcularOrden(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(codigo);
  });
});

describe("calcularOrden — tramo prorrateado (Mejora v2.1, 8.10)", () => {
  it("una renovación cobra tramo más período; la bonificación alcanza al tramo", () => {
    const r = calcular(
      base({
        items: [
          item({
            clave: "a",
            tipoAccion: "RENOVACION",
            precioRenovacion: centavos("30000"),
            prorrata: centavos("19000"),
            bonifPorcentaje: porcentaje("10"),
          }),
        ],
        alicuotaIva: 0n,
      }),
    );
    expect(r.items[0]).toMatchObject({
      precioLista: centavos("49000"),
      bonificacion: centavos("4900"),
      precioFinal: centavos("44100"),
    });
  });

  it("un alta de adicional cobra solo el tramo", () => {
    const r = calcular(
      base({
        items: [item({ clave: "a", prorrata: centavos("17000"), incluyePeriodo: false })],
        alicuotaIva: 0n,
      }),
    );
    expect(r.subtotal).toBe(centavos("17000"));
  });
});
