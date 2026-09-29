import { describe, expect, it } from "vitest";
import { anidar, rutaInternaSegura } from "./formulario";

describe("anidar", () => {
  it("arma objetos anidados y omite los vacíos", () => {
    expect(
      anidar({ nombre: "Ana", "domicilio.calle": "Córdoba 1", "domicilio.piso": "", "c.d.e": "x" }),
    ).toEqual({ nombre: "Ana", domicilio: { calle: "Córdoba 1" }, c: { d: { e: "x" } } });
  });

  it("no permite contaminar el prototipo", () => {
    const resultado = anidar({ "__proto__.contaminado": "sí", "constructor.prototype.x": "sí" });
    expect(({} as Record<string, unknown>).contaminado).toBeUndefined();
    expect(resultado).toEqual({});
  });
});

describe("rutaInternaSegura", () => {
  it("acepta rutas internas", () => {
    expect(rutaInternaSegura("/admin/clientes?q=a", "/portal")).toBe("/admin/clientes?q=a");
  });

  it.each([
    ["otro sitio", "https://malo.com"],
    ["protocolo relativo", "//malo.com"],
    ["barra invertida", "/\\malo.com"],
    ["barra invertida en el medio", "/admin\\..\\malo"],
    ["salto de línea", "/admin\r\nSet-Cookie: x=1"],
    ["sin barra inicial", "admin"],
    ["no es texto", 42],
  ])("rechaza %s", (_, ruta) => {
    expect(rutaInternaSegura(ruta, "/portal")).toBe("/portal");
  });
});
