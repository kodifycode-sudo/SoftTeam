import { describe, expect, it } from "vitest";
import { fecha } from "../fecha";
import {
  avisoDeVencimiento,
  esDiaDeRecordatorio,
  estadoDeSaldo,
  ventanasDeRenovacion,
} from "./calendario";

describe("ventanasDeRenovacion (Mejora v2.1, 8.2)", () => {
  it("antes del primer corte solo quedan las del mes anterior", () => {
    const ventanas = ventanasDeRenovacion(fecha("2026-10-01"));
    expect(ventanas.map((v) => v.clave)).toEqual(["2026-09-C1", "2026-09-C2"]);
  });

  it("el día 2 renueva los vencimientos del 3 al 12 (los alineados al 10)", () => {
    expect(ventanasDeRenovacion(fecha("2026-10-02")).at(-1)).toEqual({
      clave: "2026-10-C1",
      desde: "2026-10-03",
      hasta: "2026-10-12",
      corte: "2026-10-02",
    });
  });

  it("el día 11 renueva del 13 al 2 del mes siguiente (los alineados al 20)", () => {
    const ventanas = ventanasDeRenovacion(fecha("2026-10-11"));
    expect(ventanas.at(-1)).toEqual({
      clave: "2026-10-C2",
      desde: "2026-10-13",
      hasta: "2026-11-02",
      corte: "2026-10-11",
    });
    expect(ventanas).toHaveLength(4);
  });

  it("maneja fin de año y febrero", () => {
    expect(ventanasDeRenovacion(fecha("2026-12-20")).at(-1)).toMatchObject({
      clave: "2026-12-C2",
      desde: "2026-12-13",
      hasta: "2027-01-02",
    });
    expect(ventanasDeRenovacion(fecha("2027-02-11")).at(-1)).toMatchObject({
      desde: "2027-02-13",
      hasta: "2027-03-02",
    });
  });

  it("respeta días de corte configurados", () => {
    const ventanas = ventanasDeRenovacion(fecha("2026-10-08"), [8, 22]);
    expect(ventanas.at(-1)).toMatchObject({
      clave: "2026-10-C1",
      desde: "2026-10-09",
      hasta: "2026-10-23",
      corte: "2026-10-08",
    });
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
