import { describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import { periodosComparables, rangoDeDias, rangoDeMeses, variacion } from "./periodos";

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

describe("rangos de los filtros de reportes", () => {
  const hoy = fecha("2026-10-10");

  it("meses: por defecto los últimos 12; invertidos se ordenan; con tope", () => {
    expect(rangoDeMeses(undefined, undefined, hoy).meses).toHaveLength(12);
    expect(rangoDeMeses(undefined, undefined, hoy).rango).toEqual({
      desde: "2025-11-01",
      hasta: "2026-11-01",
    });
    expect(rangoDeMeses("2026-03", "2026-01", hoy).meses).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(rangoDeMeses("2020-01", "2026-10", hoy).meses).toHaveLength(36);
    expect(rangoDeMeses("2026-13", "x", hoy).meses.at(-1)).toBe("2026-10");
  });

  it("días: por defecto el mes en curso; hasta exclusivo en el rango", () => {
    expect(rangoDeDias(undefined, undefined, hoy)).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-10",
      rango: { desde: "2026-10-01", hasta: "2026-10-11" },
    });
    expect(rangoDeDias("2026-09-30", "2026-09-01", hoy).desde).toBe("2026-09-01");
  });
});
