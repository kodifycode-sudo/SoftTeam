import { describe, expect, it } from "vitest";
import { porcentaje } from "../dinero";
import { type CondicionFiscal, codigoCondicionIva, condicionParaFacturar } from "./impuestos";

const condicion = (parcial: Partial<CondicionFiscal> = {}): CondicionFiscal => ({
  codigo: "EXENTO",
  codigoArca: 4,
  alicuota: porcentaje("21"),
  comprobante: "B",
  activa: true,
  ...parcial,
});

describe("condición frente al IVA", () => {
  it("la alícuota y el comprobante salen de la condición configurada", () => {
    expect(condicionParaFacturar(condicion())).toEqual({
      ok: true,
      valor: { codigo: "EXENTO", codigoArca: 4, alicuota: porcentaje("21"), comprobante: "B" },
    });
    expect(
      condicionParaFacturar(
        condicion({ codigo: "MONOTRIBUTO_A", codigoArca: 6, comprobante: "A" }),
      ),
    ).toMatchObject({ ok: true, valor: { comprobante: "A", codigoArca: 6 } });
  });

  it("sin condición o dada de baja no se factura: no hay condición por defecto", () => {
    expect(condicionParaFacturar(undefined)).toMatchObject({
      ok: false,
      error: "IVA_COND_INVALIDA",
    });
    expect(condicionParaFacturar(condicion({ activa: false }))).toMatchObject({
      ok: false,
      error: "IVA_COND_INVALIDA",
    });
  });

  it("el comprobante E (exterior) todavía no se emite", () => {
    expect(condicionParaFacturar(condicion({ comprobante: "E", alicuota: 0n }))).toMatchObject({
      ok: false,
      error: "COMP_NO_HABILITADO",
    });
  });
});

describe("código de una condición nueva", () => {
  it("sale del nombre, sin tildes ni símbolos, y no repite uno existente", () => {
    expect(codigoCondicionIva("Monotributo social", [])).toBe("MONOTRIBUTO_SOCIAL");
    expect(codigoCondicionIva("IVA no alcanzado (exportación)", [])).toBe(
      "IVA_NO_ALCANZADO_EXPORTACION",
    );
    expect(codigoCondicionIva("Exento", ["EXENTO"])).toBe("EXENTO_2");
    expect(codigoCondicionIva("Exento", ["EXENTO", "exento_2"])).toBe("EXENTO_3");
    expect(codigoCondicionIva("x".repeat(40), [])).toHaveLength(30);
    expect(codigoCondicionIva("***", [])).toBe("CONDICION");
  });
});
