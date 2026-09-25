import { describe, expect, it } from "vitest";
import { porcentaje } from "../dinero";
import { alicuotaIva, tipoComprobante } from "./impuestos";
import { type MedioPago, resolverClienteFacturacion, validarMedioPago } from "./medio-pago";

const medio = (parcial: Partial<MedioPago> = {}): MedioPago => ({
  id: "mp",
  tipo: "TRANSFERENCIA",
  activo: true,
  paisId: null,
  habilitadoAlta: true,
  habilitadoAdicional: true,
  habilitadoRenovacion: true,
  ajustePorcentaje: 0n,
  planilla: false,
  ...parcial,
});

const ctx = { paisId: "AR", instancia: "ALTA_INICIAL" } as const;

describe("validarMedioPago", () => {
  it("acepta un medio habilitado sin país", () => {
    expect(validarMedioPago(medio(), ctx).ok).toBe(true);
  });

  // Regresión N1: en la KB el Else final habilitaba estos casos para ALTA_INICIAL.
  it.each([
    ["inactivo", medio({ activo: false })],
    ["de otro país", medio({ paisId: "UY" })],
    ["no habilitado para alta", medio({ habilitadoAlta: false })],
    ["inexistente", undefined],
  ])("rechaza un medio %s", (_, m) => {
    expect(validarMedioPago(m, ctx)).toMatchObject({ ok: false, error: "MEDIO_NO_HABILITADO" });
  });

  it("valida según la instancia", () => {
    const m = medio({ habilitadoRenovacion: false });
    expect(validarMedioPago(m, ctx).ok).toBe(true);
    expect(validarMedioPago(m, { ...ctx, instancia: "RENOVACION" }).ok).toBe(false);
  });
});

describe("resolverClienteFacturacion", () => {
  // Regresión N2: la KB pisaba siempre el cliente con el del grupo.
  it("usa el cliente del grupo solo con medio de planilla", () => {
    const grupo = { clienteId: "c1", clienteFacturacionGrupoId: "agrupador" };
    expect(resolverClienteFacturacion({ ...grupo, medio: medio({ planilla: true }) })).toBe(
      "agrupador",
    );
    expect(resolverClienteFacturacion({ ...grupo, medio: medio() })).toBe("c1");
    expect(
      resolverClienteFacturacion({
        clienteId: "c1",
        clienteFacturacionGrupoId: null,
        medio: medio({ planilla: true }),
      }),
    ).toBe("c1");
  });
});

describe("impuestos", () => {
  it("exento no paga IVA; el resto paga la alícuota general", () => {
    expect(alicuotaIva("EXENTO", porcentaje("21"))).toBe(0n);
    expect(alicuotaIva("MONOTRIBUTO", porcentaje("21"))).toBe(porcentaje("21"));
  });

  it("factura A solo a Responsable Inscripto", () => {
    expect(tipoComprobante("RESPONSABLE_INSCRIPTO")).toBe("A");
    expect(tipoComprobante("CONSUMIDOR_FINAL")).toBe("B");
  });
});
