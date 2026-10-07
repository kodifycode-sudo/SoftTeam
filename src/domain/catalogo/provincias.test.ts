import { describe, expect, it } from "vitest";
import { codigoProvincia } from "./provincias";

describe("codigoProvincia", () => {
  it("usa las iniciales de un nombre de varias palabras, sin conectores", () => {
    expect(codigoProvincia("Santa Fe", [])).toBe("SF");
    expect(codigoProvincia("Tierra del Fuego", [])).toBe("TF");
    expect(codigoProvincia("Ciudad Autónoma de Buenos Aires", [])).toBe("CABA");
    expect(codigoProvincia("La Pampa", [])).toBe("LP");
    expect(codigoProvincia("La Rioja", [])).toBe("LR");
  });

  it("usa las tres primeras letras de un nombre de una palabra, sin tildes", () => {
    expect(codigoProvincia("Mendoza", [])).toBe("MEN");
    expect(codigoProvincia("Córdoba", [])).toBe("COR");
  });

  it("busca otra opción legible si el código ya está usado en el país", () => {
    expect(codigoProvincia("Corrientes", ["COR"])).toBe("CRR");
    expect(codigoProvincia("San Juan", ["SJ"])).toBe("SAJ");
    expect(codigoProvincia("Santiago del Estero", ["SE"])).toBe("SAE");
  });

  it("compara sin importar mayúsculas", () => {
    expect(codigoProvincia("Mendoza", ["men"])).not.toBe("MEN");
  });

  it("si todo está tomado, agrega un número", () => {
    const usados = ["SF", "SAF", "SAN", "SNT", "SAE", "SANT"];
    expect(codigoProvincia("Santa Fe", usados)).toBe("SF2");
  });

  it("todas las provincias argentinas reciben códigos distintos", () => {
    const nombres = [
      "Buenos Aires",
      "Ciudad Autónoma de Buenos Aires",
      "Catamarca",
      "Chaco",
      "Chubut",
      "Córdoba",
      "Corrientes",
      "Entre Ríos",
      "Formosa",
      "Jujuy",
      "La Pampa",
      "La Rioja",
      "Mendoza",
      "Misiones",
      "Neuquén",
      "Río Negro",
      "Salta",
      "San Juan",
      "San Luis",
      "Santa Cruz",
      "Santa Fe",
      "Santiago del Estero",
      "Tierra del Fuego",
      "Tucumán",
    ];
    const usados: string[] = [];
    for (const nombre of nombres) {
      const codigo = codigoProvincia(nombre, usados);
      expect(codigo).toMatch(/^[A-Z0-9]{2,5}$/);
      usados.push(codigo);
    }
    expect(new Set(usados).size).toBe(nombres.length);
  });
});
