import { describe, expect, it } from "vitest";
import { fecha } from "../fecha";
import {
  avisoDeVencimiento,
  esDiaDeRecordatorio,
  estadoDeSaldo,
  ventanasDeRenovacion,
} from "./calendario";

describe("ventanasDeRenovacion", () => {
  it("antes del primer corte solo quedan las del mes anterior", () => {
    const ventanas = ventanasDeRenovacion(fecha("2026-10-04"));
    expect(ventanas.map((v) => v.clave)).toEqual(["2026-10-Q1", "2026-10-Q2"]);
  });

  it("el día 5 renueva los vencimientos del 1 al 15 del mes siguiente", () => {
    const ventanas = ventanasDeRenovacion(fecha("2026-10-05"));
    expect(ventanas.at(-1)).toEqual({
      clave: "2026-11-Q1",
      desde: "2026-11-01",
      hasta: "2026-11-15",
      corte: "2026-10-05",
    });
  });

  it("el día 15 renueva del 16 a fin del mes siguiente", () => {
    const ventanas = ventanasDeRenovacion(fecha("2026-10-15"));
    expect(ventanas.at(-1)).toEqual({
      clave: "2026-11-Q2",
      desde: "2026-11-16",
      hasta: "2026-11-30",
      corte: "2026-10-15",
    });
    expect(ventanas).toHaveLength(4);
  });

  it("maneja fin de año y febrero", () => {
    expect(ventanasDeRenovacion(fecha("2026-12-20")).at(-1)).toMatchObject({
      clave: "2027-01-Q2",
      hasta: "2027-01-31",
    });
    expect(ventanasDeRenovacion(fecha("2027-01-15")).at(-1)).toMatchObject({
      clave: "2027-02-Q2",
      desde: "2027-02-16",
      hasta: "2027-02-28",
    });
  });

  it("respeta días de corte configurados", () => {
    const ventanas = ventanasDeRenovacion(fecha("2026-10-08"), [8, 22]);
    expect(ventanas.at(-1)).toMatchObject({ clave: "2026-11-Q1", corte: "2026-10-08" });
  });
});

describe("avisoDeVencimiento", () => {
  it.each([
    [30, null],
    [16, null],
    [15, "VENCIMIENTO_15D"],
    [8, "VENCIMIENTO_15D"],
    [7, "VENCIMIENTO_7D"],
    [2, "VENCIMIENTO_7D"],
    [1, "VENCIMIENTO_1D"],
    [0, "VENCIMIENTO_1D"],
    [-1, null],
  ])("con %i días restantes: %s", (dias, tipo) => {
    expect(avisoDeVencimiento(dias)).toBe(tipo);
  });
});

describe("estadoDeSaldo", () => {
  it("detecta saldo bajo y agotado", () => {
    expect(estadoDeSaldo(1000, 500)).toBe("NORMAL");
    expect(estadoDeSaldo(1000, 200)).toBe("BAJO");
    expect(estadoDeSaldo(1000, 0)).toBe("AGOTADO");
    expect(estadoDeSaldo(0, 0)).toBe("NORMAL");
    expect(estadoDeSaldo(1000, 300, 30)).toBe("BAJO");
  });
});

describe("esDiaDeRecordatorio", () => {
  it("compara el día del mes", () => {
    expect(esDiaDeRecordatorio(fecha("2026-10-10"), [10, 20, 28])).toBe(true);
    expect(esDiaDeRecordatorio(fecha("2026-10-11"), [10, 20, 28])).toBe(false);
  });
});
