import { describe, expect, it } from "vitest";
import { consolidarLicencia } from "./licencia";

describe("consolidarLicencia", () => {
  it("suma capacidades y cupos, y habilita funciones", () => {
    const licencia = consolidarLicencia([
      [
        { recurso: "prodigal.usuarios", clase: "CAPACIDAD", cantidad: 5 },
        { recurso: "bienseguro.chatbot", clase: "FUNCION", cantidad: 0 },
        { recurso: "notificaciones.mes", clase: "CUPO_MENSUAL", cantidad: 1000 },
      ],
      [
        { recurso: "prodigal.usuarios", clase: "CAPACIDAD", cantidad: 3 },
        { recurso: "bienseguro.chatbot", clase: "FUNCION", cantidad: 1 },
      ],
    ]);
    expect(licencia.get("prodigal.usuarios")).toEqual({ clase: "CAPACIDAD", total: 8 });
    expect(licencia.get("bienseguro.chatbot")).toEqual({ clase: "FUNCION", total: 1 });
    expect(licencia.get("notificaciones.mes")).toEqual({ clase: "CUPO_MENSUAL", total: 1000 });
  });

  it("aplica reglas derivadas: emisión de CotiWeb con 4 o más usuarios", () => {
    const con3 = consolidarLicencia([
      [{ recurso: "cotiweb.usuarios", clase: "CAPACIDAD", cantidad: 3 }],
    ]);
    const con4 = consolidarLicencia([
      [{ recurso: "cotiweb.usuarios", clase: "CAPACIDAD", cantidad: 3 }],
      [{ recurso: "cotiweb.usuarios", clase: "CAPACIDAD", cantidad: 1 }],
    ]);
    expect(con3.get("cotiweb.emision")?.total).toBe(0);
    expect(con4.get("cotiweb.emision")?.total).toBe(1);
  });

  it("sin contratos vigentes no hay licencia", () => {
    expect(consolidarLicencia([], []).size).toBe(0);
  });
});
