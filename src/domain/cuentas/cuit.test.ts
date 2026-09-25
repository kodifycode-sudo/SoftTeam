import { describe, expect, it } from "vitest";
import { esCuitValido, formatearCuit, normalizarCuit } from "./cuit";

describe("CUIT", () => {
  it.each([
    "20-12345678-6",
    "30-71234567-1",
    "27-28033514-8",
    "20123456786",
  ])("acepta %s", (cuit) => {
    expect(esCuitValido(cuit)).toBe(true);
  });

  it.each([
    ["dígito verificador incorrecto", "20-12345678-5"],
    ["prefijo inexistente", "11-12345678-6"],
    ["largo incorrecto", "20-1234567-6"],
    ["vacío", ""],
  ])("rechaza %s", (_, cuit) => {
    expect(esCuitValido(cuit)).toBe(false);
  });

  it("normaliza y formatea", () => {
    expect(normalizarCuit("20 12345678 6")).toBe("20123456786");
    expect(formatearCuit("20123456786")).toBe("20-12345678-6");
  });
});
