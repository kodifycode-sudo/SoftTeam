import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cifrar, descifrar, generarSecreto } from "./cifrado";
import { cabecerasFirmadas, firmar, verificarFirma } from "./firma";

const CLAVE = randomBytes(32).toString("base64");

describe("cifrado", () => {
  it("cifra y descifra; cada cifrado es distinto", () => {
    const secreto = generarSecreto();
    const a = cifrar(secreto, CLAVE);
    const b = cifrar(secreto, CLAVE);
    expect(a).not.toBe(b);
    expect(descifrar(a, CLAVE)).toBe(secreto);
  });

  it("detecta alteraciones y claves equivocadas", () => {
    const cifrado = cifrar("secreto", CLAVE);
    const alterado = `${cifrado.slice(0, -2)}AA`;
    expect(() => descifrar(alterado, CLAVE)).toThrow();
    expect(() => descifrar(cifrado, randomBytes(32).toString("base64"))).toThrow();
  });

  it("exige una clave maestra de 32 bytes", () => {
    expect(() => cifrar("x", Buffer.from("corta").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("firma", () => {
  const secreto = "secreto-de-prueba";
  const partes = {
    metodo: "POST",
    ruta: "/api/v1/empresas/2001/consumos",
    cuerpo: '{"cantidad":10}',
  };
  const ahora = 1_790_000_000;

  it("acepta una firma válida dentro de la ventana", () => {
    const firma = firmar(secreto, { ...partes, timestamp: ahora });
    expect(
      verificarFirma(secreto, { ...partes, timestamp: String(ahora) }, firma, ahora + 60),
    ).toEqual({ ok: true });
  });

  it("rechaza cuerpo, ruta o método alterados", () => {
    const firma = firmar(secreto, { ...partes, timestamp: ahora });
    for (const cambio of [
      { cuerpo: '{"cantidad":1000}' },
      { ruta: "/api/v1/empresas/2002/consumos" },
      { metodo: "GET" },
    ]) {
      expect(
        verificarFirma(secreto, { ...partes, ...cambio, timestamp: String(ahora) }, firma, ahora),
      ).toEqual({
        ok: false,
        error: "FIRMA_INVALIDA",
      });
    }
  });

  it("rechaza peticiones viejas (anti-replay) y firmas faltantes", () => {
    const firma = firmar(secreto, { ...partes, timestamp: ahora });
    expect(
      verificarFirma(secreto, { ...partes, timestamp: String(ahora) }, firma, ahora + 301),
    ).toMatchObject({
      error: "FUERA_DE_VENTANA",
    });
    expect(
      verificarFirma(secreto, { ...partes, timestamp: String(ahora) }, null, ahora),
    ).toMatchObject({
      error: "FIRMA_FALTANTE",
    });
    expect(verificarFirma(secreto, { ...partes, timestamp: "hoy" }, firma, ahora)).toMatchObject({
      error: "TIMESTAMP_INVALIDO",
    });
  });

  it("las cabeceras firmadas se verifican del otro lado", () => {
    const c = cabecerasFirmadas("prodigal", secreto, partes, ahora);
    expect(
      verificarFirma(
        secreto,
        { ...partes, timestamp: c["x-stlic-timestamp"] ?? null },
        c["x-stlic-firma"] ?? null,
        ahora,
      ),
    ).toEqual({ ok: true });
  });
});
