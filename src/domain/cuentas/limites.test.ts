import { describe, expect, it } from "vitest";
import { fecha } from "../fecha";
import {
  type CambioColaborador,
  excedeLicencia,
  inicioMesSiguiente,
  interfazVigente,
  puedeActivar,
  validarCambioColaborador,
} from "./limites";

describe("puedeActivar", () => {
  it("permite activar mientras quede lugar", () => {
    expect(puedeActivar({ licenciados: 3, enUso: 2 }, true)).toEqual({
      ok: true,
      valor: undefined,
    });
  });

  it("rechaza al llegar al límite", () => {
    expect(puedeActivar({ licenciados: 3, enUso: 3 }, true)).toMatchObject({
      ok: false,
      error: "LIMITE_ALCANZADO",
    });
  });

  it("rechaza si el producto no está licenciado", () => {
    expect(puedeActivar({ licenciados: 5, enUso: 0 }, false)).toMatchObject({
      error: "SIN_LICENCIA",
    });
    expect(puedeActivar({ licenciados: 0, enUso: 0 }, true)).toMatchObject({
      error: "SIN_LICENCIA",
    });
  });

  it("sin límite de cantidad, alcanza con tener el producto", () => {
    expect(puedeActivar({ licenciados: null, enUso: 40 }, true).ok).toBe(true);
  });

  it("detecta el exceso cuando la licencia baja", () => {
    expect(excedeLicencia({ licenciados: 2, enUso: 3 })).toBe(true);
    expect(excedeLicencia({ licenciados: 3, enUso: 3 })).toBe(false);
    expect(excedeLicencia({ licenciados: null, enUso: 9 })).toBe(false);
  });
});

describe("baja de interfaces", () => {
  it("rige desde el primer día del mes siguiente", () => {
    expect(inicioMesSiguiente(fecha("2026-09-25"))).toBe("2026-10-01");
    expect(inicioMesSiguiente(fecha("2026-12-31"))).toBe("2027-01-01");
    expect(inicioMesSiguiente(fecha("2027-01-31"))).toBe("2027-02-01");
  });

  it("la interfaz sigue vigente hasta que rige la baja", () => {
    const baja = fecha("2026-10-01");
    expect(interfazVigente(true, baja, fecha("2026-09-30"))).toBe(true);
    expect(interfazVigente(true, baja, fecha("2026-10-01"))).toBe(false);
    expect(interfazVigente(true, null, fecha("2026-10-01"))).toBe(true);
    expect(interfazVigente(false, null, fecha("2026-10-01"))).toBe(false);
  });
});

describe("validarCambioColaborador", () => {
  const ninguno = { adminGeneral: false, adminComercial: false, adminOperativo: false };
  const general = { ...ninguno, adminGeneral: true };
  const operativo = { ...ninguno, adminOperativo: true };
  const base: CambioColaborador = {
    actor: { ...general, colaboradorId: "yo" },
    colaboradorId: "otro",
    antes: { ...ninguno, activo: true },
    despues: { ...ninguno, activo: true },
    adminsGenerales: 1,
  };

  it("un operativo gestiona usuarios sin permisos de administración", () => {
    const actor = { ...operativo, colaboradorId: "yo" };
    expect(validarCambioColaborador({ ...base, actor }).ok).toBe(true);
    expect(
      validarCambioColaborador({
        ...base,
        actor,
        antes: null,
        despues: { ...ninguno, activo: true },
      }).ok,
    ).toBe(true);
  });

  it("solo un administrador general otorga o quita permisos", () => {
    const actor = { ...operativo, colaboradorId: "yo" };
    expect(
      validarCambioColaborador({ ...base, actor, despues: { ...operativo, activo: true } }),
    ).toMatchObject({ error: "SIN_PERMISO" });
    // Dar de baja a un administrador también afecta permisos.
    expect(
      validarCambioColaborador({
        ...base,
        actor,
        antes: { ...operativo, activo: true },
        despues: { ...operativo, activo: false },
      }),
    ).toMatchObject({ error: "SIN_PERMISO" });
    expect(validarCambioColaborador({ ...base, despues: { ...operativo, activo: true } }).ok).toBe(
      true,
    );
  });

  it("nadie se quita permisos ni se da de baja a sí mismo", () => {
    expect(
      validarCambioColaborador({
        ...base,
        colaboradorId: "yo",
        antes: { ...general, activo: true },
        despues: { ...general, activo: false },
        adminsGenerales: 2,
      }),
    ).toMatchObject({ error: "PROPIO" });
  });

  it("editar datos propios sin tocar permisos está permitido", () => {
    expect(
      validarCambioColaborador({
        ...base,
        colaboradorId: "yo",
        antes: { ...general, activo: true },
        despues: { ...general, activo: true },
      }).ok,
    ).toBe(true);
  });

  it("la empresa no se queda sin administrador general", () => {
    expect(
      validarCambioColaborador({
        ...base,
        antes: { ...general, activo: true },
        despues: { ...ninguno, activo: true },
        adminsGenerales: 1,
      }),
    ).toMatchObject({ error: "ULTIMO_ADMIN" });
    expect(
      validarCambioColaborador({
        ...base,
        antes: { ...general, activo: true },
        despues: { ...ninguno, activo: true },
        adminsGenerales: 2,
      }).ok,
    ).toBe(true);
  });
});
