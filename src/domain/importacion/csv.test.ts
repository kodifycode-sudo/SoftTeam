import { describe, expect, it } from "vitest";
import { decodificar, leerSiNo, leerTabla, normalizarTitulo } from "./csv";

describe("leerTabla", () => {
  it("lee títulos y filas separados por punto y coma", () => {
    const tabla = leerTabla(
      "nombre;cuit\r\nBroker Sur;30-11111111-1\r\nBroker Norte;30-22222222-2\r\n",
    );
    expect(tabla.separador).toBe(";");
    expect(tabla.titulos).toEqual(["nombre", "cuit"]);
    expect(tabla.filas).toEqual([
      { linea: 2, valores: ["Broker Sur", "30-11111111-1"] },
      { linea: 3, valores: ["Broker Norte", "30-22222222-2"] },
    ]);
  });

  it("detecta la coma y el tabulador", () => {
    expect(leerTabla("a,b\n1,2").separador).toBe(",");
    expect(leerTabla("a\tb\n1\t2").separador).toBe("\t");
  });

  it("respeta comillas: separadores, comillas dobles y saltos de línea dentro del valor", () => {
    const tabla = leerTabla('nombre;obs;fin\n"Pérez; Ana";"dijo ""hola""\notra línea";x\nB;c;d');
    expect(tabla.filas[0]).toEqual({
      linea: 2,
      valores: ["Pérez; Ana", 'dijo "hola"\notra línea', "x"],
    });
    expect(tabla.filas[1]?.linea).toBe(4);
  });

  it("ignora líneas vacías y recorta espacios", () => {
    const tabla = leerTabla("a;b\n\n  1 ; 2 \n;\n");
    expect(tabla.filas).toEqual([{ linea: 3, valores: ["1", "2"] }]);
  });
});

describe("decodificar", () => {
  it("lee UTF-8 y quita la marca BOM", () => {
    const bytes = new TextEncoder().encode("﻿Razón;Año");
    expect(decodificar(bytes)).toBe("Razón;Año");
  });

  it("si no es UTF-8, lo lee como Windows-1252 (Excel)", () => {
    // "Razón" en Windows-1252: la ó es 0xF3.
    expect(decodificar(new Uint8Array([0x52, 0x61, 0x7a, 0xf3, 0x6e]))).toBe("Razón");
  });
});

describe("títulos y valores", () => {
  it("normaliza los títulos", () => {
    expect(normalizarTitulo("Razón social")).toBe("razonsocial");
    expect(normalizarTitulo("STLicClienteFacCUIT")).toBe("stlicclientefaccuit");
  });

  it("lee sí/no", () => {
    expect(leerSiNo("Sí")).toBe(true);
    expect(leerSiNo("1")).toBe(true);
    expect(leerSiNo("N")).toBe(false);
    expect(leerSiNo("")).toBe(false);
    expect(leerSiNo("tal vez")).toBeUndefined();
  });
});
