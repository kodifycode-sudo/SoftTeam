import { describe, expect, it } from "vitest";
import { accionLegible, campoLegible, diferencias, nombreDe, valorLegible } from "./auditoria";

describe("accionLegible y nombreDe", () => {
  it("usa la etiqueta o reemplaza guiones bajos", () => {
    expect(accionLegible("registrar_pago")).toBe("Pago registrado");
    expect(accionLegible("algo_nuevo")).toBe("algo nuevo");
  });

  it("prefiere el nombre de después, luego el de antes, luego el mail", () => {
    expect(nombreDe({ nombre: "Viejo" }, { nombre: "Nuevo" })).toBe("Nuevo");
    expect(nombreDe({ nombre: "Viejo" }, null)).toBe("Viejo");
    expect(nombreDe(null, { email: "a@b.com" })).toBe("a@b.com");
    expect(nombreDe(null, null)).toBeUndefined();
  });
});

describe("campoLegible", () => {
  it("separa palabras y corrige tildes, siglas y productos", () => {
    expect(campoLegible("codigo")).toBe("Código");
    expect(campoLegible("condicionIva")).toBe("Condición IVA");
    expect(campoLegible("interfazCotiwebBajaDesde")).toBe("Interfaz CotiWeb baja desde");
    expect(campoLegible("tipo_comunicacion")).toBe("Tipo comunicación");
  });
});

describe("diferencias", () => {
  it("lista solo lo que cambió, con nombres y valores legibles", () => {
    expect(
      diferencias(
        { activa: true, interfazProdigal: true, bajaDesde: null, actualizadoEn: "x", nombre: "A" },
        {
          activa: true,
          interfazProdigal: false,
          bajaDesde: "2026-10-01",
          actualizadoEn: "y",
          nombre: "A",
        },
      ),
    ).toEqual([
      { campo: "Interfaz Prodigal", antes: "Sí", despues: "No" },
      { campo: "Baja desde", antes: "—", despues: "01 de oct de 2026" },
    ]);
  });

  it("en un alta muestra los campos con valor", () => {
    expect(diferencias(null, { nombre: "Allianz", activa: true, notas: null })).toEqual([
      { campo: "Nombre", antes: "—", despues: "Allianz" },
      { campo: "Activa", antes: "—", despues: "Sí" },
    ]);
  });

  it("compara objetos anidados por contenido", () => {
    expect(diferencias({ domicilio: { calle: "A" } }, { domicilio: { calle: "A" } })).toEqual([]);
    expect(diferencias({ domicilio: { calle: "A" } }, { domicilio: { calle: "B" } })).toEqual([
      { campo: "Domicilio", antes: '{"calle":"A"}', despues: '{"calle":"B"}' },
    ]);
  });

  it("formatea fechas y horas en hora argentina", () => {
    // 00:00 UTC del 30 son las 21:00 del 29 en Argentina.
    expect(valorLegible("2026-09-30T00:00:51.551Z")).toMatch(/^29\/9\/26, 9:00\s?p/);
  });
});
