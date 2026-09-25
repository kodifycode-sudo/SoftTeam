import { describe, expect, it } from "vitest";
import {
  aplicarPorcentaje,
  aTextoDecimal,
  centavos,
  dividirRedondeando,
  formatearMoneda,
  porcentaje,
} from "./dinero";

describe("dividirRedondeando", () => {
  it("redondea la mitad alejándose de cero, como ROUND() de SQL", () => {
    expect(dividirRedondeando(5n, 2n)).toBe(3n);
    expect(dividirRedondeando(-5n, 2n)).toBe(-3n);
    expect(dividirRedondeando(4n, 3n)).toBe(1n);
    expect(dividirRedondeando(-4n, 3n)).toBe(-1n);
  });

  it("rechaza la división por cero", () => {
    expect(() => dividirRedondeando(1n, 0n)).toThrow(RangeError);
  });
});

describe("aplicarPorcentaje", () => {
  it("calcula a centavos exactos", () => {
    expect(aplicarPorcentaje(centavos("135000"), porcentaje("21"))).toBe(centavos("28350"));
    // 0,125 → 0,13 (mitad hacia arriba)
    expect(aplicarPorcentaje(centavos("1.25"), porcentaje("10"))).toBe(centavos("0.13"));
    // recargo negativo (bonificación por medio de pago)
    expect(aplicarPorcentaje(centavos("1.25"), porcentaje("-10"))).toBe(centavos("-0.13"));
  });
});

describe("conversión de texto", () => {
  it("interpreta punto y coma decimal sin pasar por number", () => {
    expect(centavos("1234.5")).toBe(123450n);
    expect(centavos("1234,56")).toBe(123456n);
    expect(centavos("-0.07")).toBe(-7n);
    expect(centavos("90071992547409.93")).toBe(9007199254740993n);
  });

  it("rechaza formatos ambiguos", () => {
    expect(() => centavos("1.234,56")).toThrow(RangeError);
    expect(() => centavos("12.345")).toThrow(RangeError);
    expect(() => centavos("")).toThrow(RangeError);
  });

  it("vuelve a texto decimal para la base", () => {
    expect(aTextoDecimal(123456n)).toBe("1234.56");
    expect(aTextoDecimal(-7n)).toBe("-0.07");
    expect(aTextoDecimal(0n)).toBe("0.00");
  });

  it("formatea en moneda local", () => {
    expect(formatearMoneda(centavos("163350"))).toMatch(/163\.350,00/);
  });
});
