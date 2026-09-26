import { describe, expect, it } from "vitest";
import { contraste, notasVisibles, textoSobre, validarLogo } from "./marca";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const SVG = [...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')];

describe("validarLogo", () => {
  it("reconoce el formato por el contenido", () => {
    expect(validarLogo(Uint8Array.from(PNG))).toEqual({ ok: true, tipo: "image/png" });
    expect(validarLogo(Uint8Array.from(JPEG))).toEqual({ ok: true, tipo: "image/jpeg" });
    expect(validarLogo(Uint8Array.from(WEBP))).toEqual({ ok: true, tipo: "image/webp" });
  });

  it("rechaza SVG, archivos vacíos o demasiado grandes", () => {
    expect(validarLogo(Uint8Array.from(SVG))).toEqual({ ok: false, error: "FORMATO_INVALIDO" });
    expect(validarLogo(new Uint8Array())).toEqual({ ok: false, error: "VACIO" });
    const grande = new Uint8Array(301 * 1024);
    grande.set(PNG);
    expect(validarLogo(grande)).toEqual({ ok: false, error: "DEMASIADO_GRANDE" });
  });
});

describe("colores", () => {
  it("calcula el contraste WCAG", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("elige el texto que mejor se lee", () => {
    expect(textoSobre("#0f1b2d")).toBe("#ffffff");
    expect(textoSobre("#fbc02d")).toBe("#000000");
  });
});

describe("notasVisibles", () => {
  const notas =
    "Cliente desde 2010.\n* Debe dos meses: no dar descuentos.\n  * otra interna\nVer contrato anual.";

  it("SOFTeam ve todo", () => {
    expect(notasVisibles(notas, true)).toBe(notas);
  });

  it("el cliente no ve las líneas que empiezan con *", () => {
    expect(notasVisibles(notas, false)).toBe("Cliente desde 2010.\nVer contrato anual.");
    expect(notasVisibles(null, false)).toBe("");
  });
});
