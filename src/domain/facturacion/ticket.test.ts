import { describe, expect, it } from "vitest";
import { centavos, porcentaje } from "../dinero";
import { fecha } from "../fecha";
import { evaluarTicket, type Ticket } from "./ticket";

const ticket: Ticket = {
  codigo: "PROMO15",
  activo: true,
  porcentaje: porcentaje("15"),
  tope: centavos("15000"),
  vigenteDesde: fecha("2026-01-01"),
  vigenteHasta: fecha("2026-12-31"),
  paquetesHabilitados: [],
};

const entrada = (parcial: Partial<Parameters<typeof evaluarTicket>[0]> = {}) => ({
  ticket,
  hoy: fecha("2026-09-25"),
  tipoCliente: "DIRECTO" as const,
  items: [{ paqueteId: "p1", bonifPorcentaje: 0n }],
  consumidoSerie: 0n,
  ...parcial,
});

describe("evaluarTicket", () => {
  it("devuelve porcentaje y saldo restante del tope", () => {
    expect(evaluarTicket(entrada({ consumidoSerie: centavos("9000") }))).toEqual({
      ok: true,
      valor: { porcentaje: porcentaje("15"), saldoDisponible: centavos("6000") },
    });
  });

  it.each([
    ["TICKET_INVALIDO", entrada({ ticket: undefined })],
    ["TICKET_INVALIDO", entrada({ ticket: { ...ticket, activo: false } })],
    ["TICKET_VENCIDO", entrada({ hoy: fecha("2027-01-01") })],
    ["TICKET_CORPORATIVO", entrada({ tipoCliente: "CORPORATIVO" })],
    [
      "TICKET_SOBRE_BONIFICADO",
      entrada({ items: [{ paqueteId: "p1", bonifPorcentaje: porcentaje("5") }] }),
    ],
    [
      "TICKET_PAQUETE_NO_HABILITADO",
      entrada({
        ticket: { ...ticket, paquetesHabilitados: ["p1"] },
        items: [
          { paqueteId: "p1", bonifPorcentaje: 0n },
          { paqueteId: "p2", bonifPorcentaje: 0n },
        ],
      }),
    ],
    ["TICKET_AGOTADO", entrada({ consumidoSerie: centavos("15000") })],
  ] as const)("rechaza con %s", (codigo, e) => {
    expect(evaluarTicket(e)).toMatchObject({ ok: false, error: codigo });
  });
});
