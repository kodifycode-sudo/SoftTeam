import { describe, expect, it } from "vitest";
import { creditosPedido, type FuenteSaldo, type PedidoConsumo, planificarDebito } from "./debito";

const fuente = (parcial: Partial<FuenteSaldo> & Pick<FuenteSaldo, "contratoId">): FuenteSaldo => ({
  oficinaId: null,
  tipo: "SALDO",
  disponible: 100,
  desde: "2026-01-01",
  ...parcial,
});

const pedido = (parcial: Partial<PedidoConsumo> = {}): PedidoConsumo => ({
  cantidad: 100,
  factorCentesimos: 100,
  oficinaId: null,
  modo: "PARCIAL",
  usarPozoEmpresa: true,
  topePozoRestante: null,
  ...parcial,
});

describe("creditosPedido", () => {
  it("aplica el factor del medio y redondea hacia arriba", () => {
    expect(creditosPedido(100, 250)).toBe(250); // WhatsApp ×2,5
    expect(creditosPedido(3, 250)).toBe(8); // 7,5 → 8
    expect(() => creditosPedido(-1, 100)).toThrow(RangeError);
  });
});

describe("planificarDebito", () => {
  it("consume primero el cupo del mes y después el saldo prepago, FIFO", () => {
    const plan = planificarDebito(
      [
        fuente({ contratoId: "saldo-viejo", desde: "2025-01-01" }),
        fuente({ contratoId: "cupo", tipo: "CUPO_MENSUAL", disponible: 30 }),
        fuente({ contratoId: "saldo-nuevo", desde: "2026-06-01" }),
      ],
      pedido({ cantidad: 150 }),
    );
    expect(plan.asignaciones).toEqual([
      { contratoId: "cupo", tipo: "CUPO_MENSUAL", creditos: 30 },
      { contratoId: "saldo-viejo", tipo: "SALDO", creditos: 100 },
      { contratoId: "saldo-nuevo", tipo: "SALDO", creditos: 20 },
    ]);
    expect(plan.consumido).toBe(150);
  });

  it("una oficina usa lo suyo y después el pozo de la empresa, hasta el tope", () => {
    const fuentes = [
      fuente({ contratoId: "oficina", oficinaId: "01001", disponible: 40 }),
      fuente({ contratoId: "empresa" }),
    ];
    const plan = planificarDebito(fuentes, pedido({ oficinaId: "01001", topePozoRestante: 25 }));
    expect(plan.asignaciones).toEqual([
      { contratoId: "oficina", tipo: "SALDO", creditos: 40 },
      { contratoId: "empresa", tipo: "SALDO", creditos: 25 },
    ]);
    expect(plan.consumido).toBe(65);
  });

  it("sin permiso de pozo la oficina no toca la empresa", () => {
    const fuentes = [
      fuente({ contratoId: "oficina", oficinaId: "01001", disponible: 40 }),
      fuente({ contratoId: "empresa" }),
    ];
    expect(
      planificarDebito(fuentes, pedido({ oficinaId: "01001", usarPozoEmpresa: false })).consumido,
    ).toBe(40);
  });

  it("un consumo de empresa no toma contratos de oficinas", () => {
    const fuentes = [fuente({ contratoId: "oficina", oficinaId: "01001" })];
    expect(planificarDebito(fuentes, pedido()).consumido).toBe(0);
  });

  it("TODO_O_NADA no descuenta nada si no alcanza", () => {
    const plan = planificarDebito(
      [fuente({ contratoId: "c", disponible: 50 })],
      pedido({ modo: "TODO_O_NADA" }),
    );
    expect(plan).toEqual({ solicitado: 100, consumido: 0, asignaciones: [] });
  });
});
