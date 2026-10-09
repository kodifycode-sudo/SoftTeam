import { describe, expect, it } from "vitest";
import { fecha } from "../fecha";
import {
  type ContratoVigencia,
  estaProrrogado,
  estaVigente,
  periodoAlta,
  periodoRenovacion,
  puedeTransicionar,
} from "./contrato";

const temporal = (parcial: Partial<ContratoVigencia> = {}): ContratoVigencia => ({
  estado: "ACTIVO",
  tipoPaquete: "TEMPORAL",
  desde: fecha("2026-09-01"),
  hasta: fecha("2026-09-30"),
  pendPagoActivoHasta: null,
  ...parcial,
});

describe("estaVigente", () => {
  const hoy = fecha("2026-09-25");

  it("ACTIVO dentro del período suma; fuera, no", () => {
    expect(estaVigente(temporal(), hoy)).toBe(true);
    expect(estaVigente(temporal(), fecha("2026-10-01"))).toBe(false);
    expect(estaVigente(temporal(), fecha("2026-08-31"))).toBe(false);
  });

  it("vence al terminar el día hasta, sin esperar al proceso diario", () => {
    expect(estaVigente(temporal(), fecha("2026-09-30"))).toBe(true);
    expect(estaVigente(temporal(), fecha("2026-10-01"))).toBe(false);
  });

  it("PEND_PAGO no suma", () => {
    expect(estaVigente(temporal({ estado: "PEND_PAGO" }), hoy)).toBe(false);
  });

  it("PEND_PAGO_ACTIVO sin fecha límite suma (corporativo)", () => {
    expect(estaVigente(temporal({ estado: "PEND_PAGO_ACTIVO" }), hoy)).toBe(true);
  });

  it("PEND_PAGO_ACTIVO con plazo vencido no suma", () => {
    const c = temporal({ estado: "PEND_PAGO_ACTIVO", pendPagoActivoHasta: fecha("2026-09-20") });
    expect(estaVigente(c, hoy)).toBe(false);
  });

  it("PEND_PAGO_ACTIVO de un período terminado no suma (evita licencia duplicada)", () => {
    const anterior = temporal({
      estado: "PEND_PAGO_ACTIVO",
      desde: fecha("2026-08-01"),
      hasta: fecha("2026-08-31"),
    });
    expect(estaVigente(anterior, hoy)).toBe(false);
  });

  it("consumible: vigente mientras tenga saldo", () => {
    const c: ContratoVigencia = {
      ...temporal(),
      tipoPaquete: "CONSUMIBLE",
      hasta: null,
      saldoRestante: 10,
    };
    expect(estaVigente(c, fecha("2030-01-01"))).toBe(true);
    expect(estaVigente({ ...c, saldoRestante: 0 }, hoy)).toBe(false);
  });

  it("CANCELADO y BAJA nunca suman", () => {
    expect(estaVigente(temporal({ estado: "CANCELADO" }), hoy)).toBe(false);
    expect(estaVigente(temporal({ estado: "BAJA" }), hoy)).toBe(false);
  });
});

describe("períodos", () => {
  it("el alta dura exactamente N meses desde la habilitación", () => {
    expect(periodoAlta(fecha("2026-09-25"), 1)).toEqual({
      desde: "2026-09-25",
      hasta: "2026-10-24",
    });
    expect(periodoAlta(fecha("2026-09-25"), 12)).toEqual({
      desde: "2026-09-25",
      hasta: "2027-09-24",
    });
  });

  it("la renovación empalma con el período anterior", () => {
    expect(periodoRenovacion(fecha("2026-10-24"), 1)).toEqual({
      desde: "2026-10-25",
      hasta: "2026-11-24",
    });
  });

  it("rechaza duraciones inválidas", () => {
    expect(() => periodoAlta(fecha("2026-09-25"), 0)).toThrow(RangeError);
  });
});

describe("prórroga (Mejora v2.1, 7.7)", () => {
  it("un contrato activo sigue sumando después del vencimiento hasta el fin de la prórroga", () => {
    const c = temporal({
      estado: "ACTIVO",
      desde: fecha("2026-09-01"),
      hasta: fecha("2026-09-30"),
      prorrogaHasta: fecha("2026-10-07"),
    });
    expect(estaVigente(c, fecha("2026-10-07"))).toBe(true);
    expect(estaProrrogado(c, fecha("2026-10-07"))).toBe(true);
    expect(estaVigente(c, fecha("2026-10-08"))).toBe(false);
    expect(estaProrrogado(c, fecha("2026-09-30"))).toBe(false);
  });

  it("la prórroga solo sostiene contratos activos", () => {
    const c = temporal({
      estado: "PEND_PAGO_ACTIVO",
      pendPagoActivoHasta: null,
      desde: fecha("2026-09-01"),
      hasta: fecha("2026-09-30"),
      prorrogaHasta: fecha("2026-10-07"),
    });
    expect(estaVigente(c, fecha("2026-10-02"))).toBe(false);
  });
});

describe("estados", () => {
  it("solo permite transiciones definidas", () => {
    expect(puedeTransicionar("PEND_PAGO", "ACTIVO")).toBe(true);
    expect(puedeTransicionar("PEND_PAGO_ACTIVO", "PEND_PAGO")).toBe(true);
    expect(puedeTransicionar("ACTIVO", "PEND_PAGO")).toBe(false);
    expect(puedeTransicionar("CANCELADO", "ACTIVO")).toBe(false);
  });
});
