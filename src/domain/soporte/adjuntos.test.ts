import { describe, expect, it } from "vitest";
import {
  ADJUNTOS_POR_MENSAJE,
  nombreDeAdjunto,
  TAMANO_MAXIMO_ADJUNTO,
  tipoDeAdjunto,
  validarAdjuntos,
} from "./adjuntos";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7\n...");
const TEXTO = new TextEncoder().encode("<script>alert(1)</script>");

describe("adjuntos de soporte", () => {
  it("reconoce imágenes y PDF por su contenido", () => {
    expect(tipoDeAdjunto(PNG)).toBe("image/png");
    expect(tipoDeAdjunto(PDF)).toBe("application/pdf");
    expect(tipoDeAdjunto(TEXTO)).toBeUndefined();
  });

  it("limpia el nombre y le pone la extensión del tipo real", () => {
    expect(nombreDeAdjunto("C:\\Users\\ana\\captura error.jpeg", "image/png")).toBe(
      "captura error.png",
    );
    expect(nombreDeAdjunto('../../"raro"<>.pdf', "application/pdf")).toBe("raro.pdf");
    expect(nombreDeAdjunto("", "application/pdf")).toBe("adjunto.pdf");
  });

  it("valida todos o ninguno: cantidad, tamaño y formato", () => {
    expect(validarAdjuntos([{ nombre: "a.png", bytes: PNG }])).toMatchObject({
      ok: true,
      adjuntos: [{ nombre: "a.png", tipo: "image/png" }],
    });
    // Un input de archivo vacío (sin nombre ni contenido) no cuenta.
    expect(validarAdjuntos([{ nombre: "", bytes: new Uint8Array() }])).toEqual({
      ok: true,
      adjuntos: [],
    });
    const muchos = Array.from({ length: ADJUNTOS_POR_MENSAJE + 1 }, () => ({
      nombre: "a.png",
      bytes: PNG,
    }));
    expect(validarAdjuntos(muchos)).toEqual({ ok: false, error: "DEMASIADOS" });
    const grande = new Uint8Array(TAMANO_MAXIMO_ADJUNTO + 1);
    grande.set(PNG);
    expect(validarAdjuntos([{ nombre: "g.png", bytes: grande }])).toMatchObject({
      error: "DEMASIADO_GRANDE",
    });
    expect(
      validarAdjuntos([
        { nombre: "a.png", bytes: PNG },
        { nombre: "x.html", bytes: TEXTO },
      ]),
    ).toEqual({ ok: false, error: "FORMATO_INVALIDO", nombre: "x.html" });
  });
});
