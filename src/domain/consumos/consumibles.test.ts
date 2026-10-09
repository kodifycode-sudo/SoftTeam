import { describe, expect, it } from "vitest";
import {
  familiaConProductoVivo,
  familiaHabilitada,
  planificarReintegro,
  productoDelSistemaVivo,
  resultadoPedido,
  saldoParaRenovar,
} from "./consumibles";

describe("consumibles", () => {
  it("presupuestos solo para CotiWeb; soporte solo STLic", () => {
    expect(familiaHabilitada("cotizaciones", "cotiweb")).toBe(true);
    expect(familiaHabilitada("cotizaciones", "prodigal")).toBe(false);
    expect(familiaHabilitada("notificaciones", "prodigal")).toBe(true);
    expect(familiaHabilitada("notificaciones", "stlic")).toBe(false);
    expect(familiaHabilitada("soporte", "stlic")).toBe(true);
    expect(familiaHabilitada("soporte", "prodigal")).toBe(false);
  });

  it("el producto del sistema tiene que estar vivo; otras integraciones no se controlan", () => {
    const vivos = new Set(["bienseguro"]);
    expect(productoDelSistemaVivo("bienseguro", vivos)).toBe(true);
    expect(productoDelSistemaVivo("prodigal", vivos)).toBe(false);
    expect(productoDelSistemaVivo("integracion-propia", vivos)).toBe(true);
  });

  it("renueva notificaciones con cualquier producto vivo y presupuestos solo con CotiWeb", () => {
    expect(familiaConProductoVivo("notificaciones", new Set(["boletin"]))).toBe(true);
    expect(familiaConProductoVivo("notificaciones", new Set(["notificaciones"]))).toBe(false);
    expect(familiaConProductoVivo("cotizaciones", new Set(["prodigal"]))).toBe(false);
    expect(familiaConProductoVivo("cotizaciones", new Set(["cotiweb"]))).toBe(true);
  });

  it("resultado y umbral de renovación", () => {
    expect(resultadoPedido(100, 100)).toBe("OK");
    expect(resultadoPedido(100, 40)).toBe("PARCIAL");
    expect(resultadoPedido(100, 0)).toBe("SIN_SALDO");
    expect(saldoParaRenovar(1000, 10000, 10)).toBe(true);
    expect(saldoParaRenovar(1001, 10000, 10)).toBe(false);
    expect(saldoParaRenovar(0, 0, 10)).toBe(false);
  });

  it("el reintegro llena del consumible más nuevo hacia atrás y el resto vuelve al origen", () => {
    const destinos = [
      { contratoId: "nuevo", tipo: "SALDO" as const, capacidad: 50 },
      { contratoId: "viejo", tipo: "SALDO" as const, capacidad: 30 },
    ];
    const origenes = [
      { contratoId: "viejo", tipo: "SALDO" as const, capacidad: 200 },
      { contratoId: "cupo", tipo: "CUPO_MENSUAL" as const, capacidad: 100 },
    ];
    expect(planificarReintegro(60, destinos, origenes)).toEqual([
      { contratoId: "nuevo", tipo: "SALDO", creditos: 50 },
      { contratoId: "viejo", tipo: "SALDO", creditos: 10 },
    ]);
    expect(planificarReintegro(150, destinos, origenes)).toEqual([
      { contratoId: "nuevo", tipo: "SALDO", creditos: 50 },
      { contratoId: "viejo", tipo: "SALDO", creditos: 30 },
      { contratoId: "cupo", tipo: "CUPO_MENSUAL", creditos: 70 },
    ]);
    // Sin consumibles: vuelve al cupo del que salió.
    expect(planificarReintegro(20, [], origenes.slice(1))).toEqual([
      { contratoId: "cupo", tipo: "CUPO_MENSUAL", creditos: 20 },
    ]);
    expect(planificarReintegro(500, destinos, origenes)).toBeNull();
  });
});
