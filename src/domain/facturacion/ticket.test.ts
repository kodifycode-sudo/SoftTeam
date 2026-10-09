import { describe, expect, it } from "vitest";
import { centavos, porcentaje } from "../dinero";
import { fecha } from "../fecha";
import { evaluarTicket, saldoDeTicket, type Ticket, ticketHeredable } from "./ticket";

const ticket: Ticket = {
  codigo: "PROMO15",
  activo: true,
  porcentaje: porcentaje("15"),
  tope: centavos("15000"),
  vigenteDesde: fecha("2026-01-01"),
  vigenteHasta: fecha("2026-12-31"),
  paquetesHabilitados: [],
  uso: "UNICO_X_CLIENTE",
  usosMaximos: 0,
  minimo: 0n as ReturnType<typeof centavos>,
  moneda: "ARS",
  paisId: null,
  clienteId: null,
  altaInicial: true,
  adicional: true,
  renovacion: true,
  publico: true,
};

const entrada = (parcial: Partial<Parameters<typeof evaluarTicket>[0]> = {}) => ({
  ticket,
  hoy: fecha("2026-09-25"),
  modoFacturacion: 0 as const,
  items: [{ paqueteId: "p1", tipoAccion: "ALTA" as const, bonifPorcentaje: 0n }],
  contexto: {
    softeam: false,
    clienteId: "c1",
    paisId: "AR",
    moneda: "ARS",
    altaInicial: true,
    subtotal: centavos("100000"),
  },
  usos: 0,
  saldo: centavos("15000"),
  ...parcial,
});

describe("evaluarTicket", () => {
  it("devuelve el porcentaje y el saldo del tope", () => {
    expect(evaluarTicket(entrada())).toEqual({
      ok: true,
      valor: { porcentaje: porcentaje("15"), tope: centavos("15000") },
    });
    // Sin tope: el descuento no se acota.
    expect(evaluarTicket(entrada({ saldo: null }))).toMatchObject({ valor: { tope: null } });
  });

  it("aplica también a renovaciones si el ticket lo habilita", () => {
    const renovacion = [
      { paqueteId: "p1", tipoAccion: "RENOVACION" as const, bonifPorcentaje: 0n },
    ];
    expect(evaluarTicket(entrada({ items: renovacion }))).toMatchObject({ ok: true });
    expect(
      evaluarTicket(entrada({ items: renovacion, ticket: { ...ticket, renovacion: false } })),
    ).toMatchObject({ ok: false, error: "TICKET_INSTANCIA_NO_HABILITADA" });
  });

  it("un ticket no público solo lo aplica SOFTeam", () => {
    const privado = { ...ticket, publico: false };
    expect(evaluarTicket(entrada({ ticket: privado }))).toMatchObject({
      error: "TICKET_NO_PUBLICO",
    });
    const e = entrada({ ticket: privado });
    expect(evaluarTicket({ ...e, contexto: { ...e.contexto, softeam: true } })).toMatchObject({
      ok: true,
    });
  });

  it("cuenta los usos según el tipo", () => {
    expect(evaluarTicket(entrada({ usos: 1 }))).toMatchObject({ error: "TICKET_SIN_USOS" });
    const multiple = { ...ticket, uso: "MULTIPLE" as const };
    expect(evaluarTicket(entrada({ ticket: multiple, usos: 50 }))).toMatchObject({ ok: true });
    expect(
      evaluarTicket(entrada({ ticket: { ...multiple, usosMaximos: 3 }, usos: 3 })),
    ).toMatchObject({ error: "TICKET_SIN_USOS" });
  });

  const contexto = entrada().contexto;
  it.each([
    ["TICKET_INVALIDO", entrada({ ticket: undefined })],
    ["TICKET_INVALIDO", entrada({ ticket: { ...ticket, activo: false } })],
    ["TICKET_VENCIDO", entrada({ hoy: fecha("2027-01-01") })],
    ["TICKET_CORPORATIVO", entrada({ modoFacturacion: 3 })],
    [
      "TICKET_SOBRE_BONIFICADO",
      entrada({
        items: [{ paqueteId: "p1", tipoAccion: "ALTA", bonifPorcentaje: porcentaje("5") }],
      }),
    ],
    ["TICKET_OTRA_MONEDA", entrada({ ticket: { ...ticket, moneda: "USD" } })],
    ["TICKET_OTRO_PAIS", entrada({ ticket: { ...ticket, paisId: "UY" } })],
    ["TICKET_OTRO_CLIENTE", entrada({ ticket: { ...ticket, clienteId: "otro" } })],
    [
      "TICKET_PAQUETE_NO_HABILITADO",
      entrada({
        ticket: { ...ticket, paquetesHabilitados: ["p1"] },
        items: [
          { paqueteId: "p1", tipoAccion: "ALTA", bonifPorcentaje: 0n },
          { paqueteId: "p2", tipoAccion: "ALTA", bonifPorcentaje: 0n },
        ],
      }),
    ],
    ["TICKET_INSTANCIA_NO_HABILITADA", entrada({ ticket: { ...ticket, altaInicial: false } })],
    [
      "TICKET_MINIMO",
      entrada({
        contexto: { ...contexto, subtotal: centavos("999") },
        ticket: { ...ticket, minimo: centavos("1000") },
      }),
    ],
    ["TICKET_AGOTADO", entrada({ saldo: centavos("0") })],
  ] as const)("rechaza con %s", (codigo, e) => {
    expect(evaluarTicket(e)).toMatchObject({ ok: false, error: codigo });
  });
});

describe("el ticket como saldo en la serie", () => {
  it("el saldo es el tope menos lo descontado; tope 0 es sin tope", () => {
    expect(saldoDeTicket(centavos("15000"), centavos("12000"))).toBe(centavos("3000"));
    expect(saldoDeTicket(centavos("15000"), centavos("20000"))).toBe(0n);
    expect(saldoDeTicket(0n as ReturnType<typeof centavos>, centavos("5000"))).toBeNull();
  });

  it("se hereda 12 meses desde la orden de origen y mientras quede saldo", () => {
    const base = { emitidaOrigen: fecha("2026-01-15"), saldo: centavos("100") };
    expect(ticketHeredable({ ...base, hoy: fecha("2027-01-15") })).toBe(true);
    expect(ticketHeredable({ ...base, hoy: fecha("2027-01-16") })).toBe(false);
    expect(ticketHeredable({ ...base, hoy: fecha("2026-06-01"), saldo: centavos("0") })).toBe(
      false,
    );
    expect(ticketHeredable({ ...base, hoy: fecha("2026-06-01"), saldo: null })).toBe(true);
  });
});
