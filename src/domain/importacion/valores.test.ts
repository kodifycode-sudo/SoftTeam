import { describe, expect, it } from "vitest";
import {
  leerCodigoOficina,
  leerCondicionIva,
  leerCuit,
  leerEntero,
  leerModoFacturacion,
  leerProvincia,
  leerTipoInstalacion,
  leerTipoPersona,
} from "./valores";

describe("valores de importación", () => {
  it("condición de IVA por código de SOFTeam, abreviatura o condición configurada", () => {
    const activas = [
      { codigo: "RESPONSABLE_INSCRIPTO", nombre: "IVA Responsable Inscripto" },
      { codigo: "CONSUMIDOR_FINAL", nombre: "Consumidor Final" },
      { codigo: "MONOTRIBUTO", nombre: "Monotributo (Factura B)" },
      { codigo: "GRAN_CONTRIBUYENTE", nombre: "Gran Contribuyente" },
      { codigo: "MONOTRIBUTO_SOCIAL", nombre: "Monotributo social" },
    ];
    const leer = (v: string) => leerCondicionIva(v, activas);
    expect(leer("Responsable Inscripto")).toBe("RESPONSABLE_INSCRIPTO");
    expect(leer("RI")).toBe("RESPONSABLE_INSCRIPTO");
    expect(leer("1")).toBe("RESPONSABLE_INSCRIPTO");
    expect(leer("2")).toBe("CONSUMIDOR_FINAL");
    expect(leer("3")).toBe("MONOTRIBUTO");
    // En SOFTeam el 5 es Gran Contribuyente (no el código de ARCA de consumidor final).
    expect(leer("5")).toBe("GRAN_CONTRIBUYENTE");
    expect(leer("Monotributo social")).toBe("MONOTRIBUTO_SOCIAL");
    // Una condición que no está activa no se acepta.
    expect(leer("Exento")).toBeUndefined();
    expect(leer("otra")).toBeUndefined();
  });

  it("tipo de persona, de cliente e instalación", () => {
    expect(leerTipoPersona("J")).toBe("JURIDICA");
    expect(leerTipoPersona("Persona humana")).toBe("FISICA");
    expect(leerModoFacturacion("")).toBe(0);
    expect(leerModoFacturacion("1")).toBe(1);
    expect(leerModoFacturacion("Factura agrupada")).toBe(3);
    // Tipo de cliente de archivos viejos.
    expect(leerModoFacturacion("Corporativo")).toBe(3);
    expect(leerModoFacturacion("Directo")).toBe(0);
    expect(leerModoFacturacion("7")).toBeUndefined();
    expect(leerTipoInstalacion("On-premise")).toBe("ON_PREMISE");
    expect(leerTipoInstalacion("nube")).toBe("SAAS");
  });

  it("provincias con o sin acentos y sus formas habituales", () => {
    const lista = ["Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Córdoba"];
    expect(leerProvincia("cordoba", lista)).toBe("Córdoba");
    expect(leerProvincia("CABA", lista)).toBe("Ciudad Autónoma de Buenos Aires");
    expect(leerProvincia("Capital Federal", lista)).toBe("Ciudad Autónoma de Buenos Aires");
    expect(leerProvincia("Bs. As.", lista)).toBe("Buenos Aires");
    expect(leerProvincia("Montevideo", lista)).toBeUndefined();
    // Solo las del país: una que no está en la lista no se acepta.
    expect(leerProvincia("CABA", ["Montevideo"])).toBeUndefined();
  });

  it("CUIT y enteros", () => {
    expect(leerCuit("20-12345678-6")).toBe("20123456786");
    expect(leerCuit("20-12345678-5")).toBeUndefined();
    expect(leerEntero("0012")).toBe(12);
    expect(leerEntero("2.001")).toBe(2001);
    expect(leerEntero("abc")).toBeUndefined();
    expect(leerEntero("0")).toBeUndefined();
  });

  it("código de canal y oficina en sus distintas formas", () => {
    expect(leerCodigoOficina("01-002")).toEqual({ canal: "01", oficina: "002" });
    expect(leerCodigoOficina("1002")).toEqual({ canal: "01", oficina: "002" });
    expect(leerCodigoOficina("2", "1")).toEqual({ canal: "01", oficina: "002" });
    expect(leerCodigoOficina("x")).toBeUndefined();
  });
});
