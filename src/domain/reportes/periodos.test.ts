import { describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import { periodosComparables, variacion } from "./periodos";

describe("periodosComparables", () => {
  it("compara del 1 a hoy con el mismo tramo del mes anterior", () => {
    expect(periodosComparables(fecha("2026-10-06"))).toEqual({
      actual: { desde: "2026-10-01", hasta: "2026-10-07" },
      anterior: { desde: "2026-09-01", hasta: "2026-09-07" },
    });
  });

  it("si el mes anterior es más corto, toma el mes anterior entero", () => {
    expect(periodosComparables(fecha("2026-03-31")).anterior).toEqual({
      desde: "2026-02-01",
      hasta: "2026-03-01",
    });
    expect(periodosComparables(fecha("2026-03-29")).anterior).toEqual({
      desde: "2026-02-01",
      hasta: "2026-03-01",
    });
  });

  it("cruza el cambio de año", () => {
    expect(periodosComparables(fecha("2027-01-15")).anterior).toEqual({
      desde: "2026-12-01",
      hasta: "2026-12-16",
    });
  });
});

describe("variacion", () => {
  it("calcula el sentido, el porcentaje y la diferencia", () => {
    expect(variacion(1125n, 1000n)).toEqual({
      sentido: "sube",
      porcentaje: 1250n,
      diferencia: 125n,
    });
    expect(variacion(500n, 1000n)).toEqual({
      sentido: "baja",
      porcentaje: -5000n,
      diferencia: -500n,
    });
    expect(variacion(7n, 7n)).toEqual({ sentido: "igual", porcentaje: 0n, diferencia: 0n });
  });

  it("sin valor anterior no hay porcentaje", () => {
    expect(variacion(3n, 0n)).toEqual({ sentido: "sube", porcentaje: null, diferencia: 3n });
    expect(variacion(0n, 0n)).toEqual({ sentido: "igual", porcentaje: null, diferencia: 0n });
  });
});
