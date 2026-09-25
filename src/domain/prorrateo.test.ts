import { describe, expect, it } from "vitest";
import { prorratear } from "./prorrateo";

const suma = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

describe("prorratear", () => {
  it("reparte el sobrante al mayor resto", () => {
    // 16335000 × 9/14 = 10501071,43 ; × 5/14 = 5833928,57 → el centavo va al segundo.
    expect(prorratear(16_335_000n, [9_000_000n, 5_000_000n])).toEqual([10_501_071n, 5_833_929n]);
  });

  it("siempre suma exactamente el total", () => {
    for (let total = 0n; total < 500n; total += 7n) {
      const pesos = [3n, 1n, 1n, 0n, 7n, 11n];
      expect(suma(prorratear(total, pesos))).toBe(total);
    }
  });

  it("no concentra el redondeo en un solo ítem", () => {
    const partes = prorratear(100n, [1n, 1n, 1n]);
    expect(partes).toEqual([34n, 33n, 33n]);
  });

  it("con todos los pesos en cero reparte en partes iguales", () => {
    expect(prorratear(10n, [0n, 0n, 0n])).toEqual([4n, 3n, 3n]);
  });

  it("rechaza entradas inválidas", () => {
    expect(() => prorratear(-1n, [1n])).toThrow(RangeError);
    expect(() => prorratear(1n, [-1n])).toThrow(RangeError);
    expect(() => prorratear(1n, [])).toThrow(RangeError);
    expect(prorratear(0n, [])).toEqual([]);
  });
});
