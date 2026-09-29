import { describe, expect, it } from "vitest";
import {
  leerCodigoOficina,
  leerCondicionIva,
  leerCuit,
  leerEntero,
  leerProvincia,
  leerTipoCliente,
  leerTipoInstalacion,
  leerTipoPersona,
} from "./valores";

describe("valores de importación", () => {
  it("condición de IVA por texto, abreviatura o código AFIP", () => {
    expect(leerCondicionIva("Responsable Inscripto")).toBe("RESPONSABLE_INSCRIPTO");
    expect(leerCondicionIva("RI")).toBe("RESPONSABLE_INSCRIPTO");
    expect(leerCondicionIva("1")).toBe("RESPONSABLE_INSCRIPTO");
    expect(leerCondicionIva("monotributo")).toBe("MONOTRIBUTO");
    expect(leerCondicionIva("6")).toBe("MONOTRIBUTO");
    expect(leerCondicionIva("Consumidor Final")).toBe("CONSUMIDOR_FINAL");
    expect(leerCondicionIva("otra")).toBeUndefined();
  });

  it("tipo de persona, de cliente e instalación", () => {
    expect(leerTipoPersona("J")).toBe("JURIDICA");
    expect(leerTipoPersona("Persona humana")).toBe("FISICA");
    expect(leerTipoCliente("Corporativo")).toBe("CORPORATIVO");
    expect(leerTipoCliente("")).toBe("DIRECTO");
    expect(leerTipoInstalacion("On-premise")).toBe("ON_PREMISE");
    expect(leerTipoInstalacion("nube")).toBe("SAAS");
  });

  it("provincias con o sin acentos y sus formas habituales", () => {
    expect(leerProvincia("cordoba")).toBe("Córdoba");
    expect(leerProvincia("CABA")).toBe("Ciudad Autónoma de Buenos Aires");
    expect(leerProvincia("Capital Federal")).toBe("Ciudad Autónoma de Buenos Aires");
    expect(leerProvincia("Bs. As.")).toBe("Buenos Aires");
    expect(leerProvincia("Montevideo")).toBeUndefined();
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
