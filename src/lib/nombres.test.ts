import { describe, expect, it } from "vitest";
import { nombresEquivalentes } from "./nombres";

describe("nombresEquivalentes", () => {
  it("ignora el tipo societario, tildes, mayúsculas y puntuación", () => {
    expect(nombresEquivalentes("Broker del Sur", "Broker del Sur SA")).toBe(true);
    expect(nombresEquivalentes("Litoral Asesores", "Litoral Asesores S.R.L.")).toBe(true);
    expect(nombresEquivalentes("Patagonia Brokers", "PATAGONIA BROKERS S.A.")).toBe(true);
    expect(nombresEquivalentes("Gómez Seguros", "Gomez Seguros SAS")).toBe(true);
  });

  it("distingue nombres que no son el mismo", () => {
    expect(nombresEquivalentes("Andino Mendoza", "Andino Seguros SRL")).toBe(false);
    expect(nombresEquivalentes("Martínez Seguros", "Martínez, Martín")).toBe(false);
  });

  it("no borra un nombre que es solo una sigla", () => {
    expect(nombresEquivalentes("SA", "SRL")).toBe(false);
  });
});
