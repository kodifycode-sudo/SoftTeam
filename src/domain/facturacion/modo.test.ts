import { describe, expect, it } from "vitest";
import { fecha } from "../fecha";
import {
  aceptaTicket,
  estadoInicial,
  facturaAlConfirmar,
  medioPermitidoParaModo,
  plazoDeAlta,
  plazosDeRenovacion,
  suspende,
} from "./modo";

describe("modo de facturación", () => {
  it("modos 0 y 2 esperan el pago; 1 y 3 nacen habilitados y facturan al confirmar", () => {
    expect([0, 1, 2, 3].map((m) => estadoInicial(m as 0))).toEqual([
      "PEND_PAGO",
      "PEND_PAGO_ACTIVO",
      "PEND_PAGO",
      "PEND_PAGO_ACTIVO",
    ]);
    expect([0, 1, 2, 3].map((m) => facturaAlConfirmar(m as 0))).toEqual([false, true, false, true]);
  });

  it("el modo 3 no acepta tickets ni se suspende", () => {
    expect(aceptaTicket(3)).toBe(false);
    expect(aceptaTicket(0)).toBe(true);
    expect(suspende(3)).toBe(false);
    expect(suspende(1)).toBe(true);
  });

  it("plazo de un alta habilitada: el modo 1 con tolerancia; el 3, sin límite", () => {
    expect(plazoDeAlta(1, 30, fecha("2026-10-09"))).toBe(fecha("2026-11-08"));
    expect(plazoDeAlta(3, 90, fecha("2026-10-09"))).toBeNull();
  });

  it("tolerancia de una renovación pendiente", () => {
    const hasta = fecha("2026-10-10");
    const desde = fecha("2026-10-11");
    expect(plazosDeRenovacion(0, 7, hasta, desde)).toEqual({
      prorrogaAnterior: fecha("2026-10-17"),
      pendPagoActivoHasta: null,
    });
    expect(plazosDeRenovacion(2, 30, hasta, desde).prorrogaAnterior).toBe(fecha("2026-11-09"));
    expect(plazosDeRenovacion(1, 30, hasta, desde)).toEqual({
      prorrogaAnterior: null,
      pendPagoActivoHasta: fecha("2026-11-10"),
    });
    expect(plazosDeRenovacion(3, 90, hasta, desde)).toEqual({
      prorrogaAnterior: null,
      pendPagoActivoHasta: null,
    });
  });

  it("cada medio declara con qué modos se usa", () => {
    expect(medioPermitidoParaModo([0, 2], 0)).toBe(true);
    expect(medioPermitidoParaModo([1], 0)).toBe(false);
  });
});
