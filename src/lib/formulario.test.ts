import { describe, expect, it } from "vitest";
import { rutaInternaSegura } from "./formulario";

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
