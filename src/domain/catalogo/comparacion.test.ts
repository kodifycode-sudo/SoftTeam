import { describe, expect, it } from "vitest";
import { centavos } from "@/domain/dinero";
import { compararConMensual } from "./comparacion";

describe("compararConMensual", () => {
  it("calcula el precio por mes y el ahorro frente al mensual", () => {
    const r = compararConMensual([
      { id: "m", meses: 1, precioCompra: centavos("100000") },
      { id: "a", meses: 12, precioCompra: centavos("1080000") },
    ]);
    expect(r.get("m")).toBeUndefined();
    expect(r.get("a")).toEqual({ porMes: centavos("90000"), ahorro: 1000n });
  });

  it("redondea el ahorro a puntos enteros y el precio a centavos", () => {
    const r = compararConMensual([
      { id: "m", meses: 1, precioCompra: centavos("38000") },
      { id: "a", meses: 12, precioCompra: centavos("399000") },
    ]);
    // 456.000 sin descuento → 12,5 % de ahorro, redondeado a 13 %.
    expect(r.get("a")).toEqual({ porMes: centavos("33250"), ahorro: 1300n });
  });

  it("sin alternativa mensual muestra el precio por mes pero no un ahorro", () => {
    const r = compararConMensual([{ id: "s", meses: 6, precioCompra: centavos("100") }]);
    expect(r.get("s")).toEqual({ porMes: centavos("16.67"), ahorro: null });
  });

  it("no inventa un ahorro si la alternativa larga sale igual o más cara", () => {
    const r = compararConMensual([
      { id: "m", meses: 1, precioCompra: centavos("100") },
      { id: "a", meses: 12, precioCompra: centavos("1300") },
    ]);
    expect(r.get("a")?.ahorro).toBeNull();
  });

  it("ignora los pagos únicos", () => {
    expect(compararConMensual([{ id: "c", meses: null, precioCompra: 100n }]).size).toBe(0);
  });
});
