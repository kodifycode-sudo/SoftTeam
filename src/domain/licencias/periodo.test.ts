import { describe, expect, it } from "vitest";
import { centavos } from "../dinero";
import { fecha } from "../fecha";
import {
  calcularPeriodo,
  type EntradaPeriodo,
  planPermitido,
  proximoDia,
  semaforoNegociacion,
  situacionAlta,
} from "./periodo";

const MENSUAL = centavos("30000");
const ANUAL = centavos("365000");

const entrada = (parcial: Partial<EntradaPeriodo>): EntradaPeriodo => ({
  tipo: "RENOVACION",
  desde: fecha("2026-03-23"),
  diaVenc: 10,
  fechaEmision: fecha("2026-03-15"),
  meses: 1,
  precioLista: MENSUAL,
  minDiasTramo: 10,
  ...parcial,
});

describe("día de vencimiento", () => {
  it("la primera fecha con ese día que no sea anterior", () => {
    expect(proximoDia(fecha("2026-03-05"), 10)).toBe("2026-03-10");
    expect(proximoDia(fecha("2026-03-10"), 10)).toBe("2026-03-10");
    expect(proximoDia(fecha("2026-03-11"), 10)).toBe("2026-04-10");
    expect(proximoDia(fecha("2026-12-25"), 20)).toBe("2027-01-20");
  });
});

// Casos de referencia del ciclo alineado (fechas día/mes, días inclusivos).
describe("renovación con tramo", () => {
  it("2: vence 22/03, se negocia el 15/03 mensual al 10 → tramo 23/03 a 10/04 (19 días) + mes", () => {
    expect(calcularPeriodo(entrada({}))).toEqual({
      fechaObjetivo: "2026-04-10",
      prorrataDias: 19,
      prorrataImporte: centavos("19000"),
      incluyePeriodo: true,
      hasta: "2026-05-10",
    });
  });

  it("3: tramo menor al mínimo → se alinea al mes siguiente (36 días)", () => {
    const r = calcularPeriodo(
      entrada({ desde: fecha("2026-04-05"), fechaEmision: fecha("2026-04-01") }),
    );
    expect(r).toMatchObject({ fechaObjetivo: "2026-05-10", prorrataDias: 36, hasta: "2026-06-10" });
  });

  it("4: anual al 20 → tramo de 29 días sobre 365", () => {
    const r = calcularPeriodo(entrada({ diaVenc: 20, meses: 12, precioLista: ANUAL }));
    expect(r).toMatchObject({
      fechaObjetivo: "2026-04-20",
      prorrataDias: 29,
      prorrataImporte: centavos("29000"),
      hasta: "2027-04-20",
    });
  });

  it("5: acordada tarde → el tramo cubre todo lo transcurrido (80 días)", () => {
    const r = calcularPeriodo(entrada({ fechaEmision: fecha("2026-05-15") }));
    expect(r).toMatchObject({ fechaObjetivo: "2026-06-10", prorrataDias: 80, hasta: "2026-07-10" });
  });

  it("6: ya alineada y generada con anticipación → sin tramo", () => {
    const r = calcularPeriodo(
      entrada({ desde: fecha("2026-06-11"), fechaEmision: fecha("2026-06-02") }),
    );
    expect(r).toEqual({
      fechaObjetivo: "2026-06-10",
      prorrataDias: 0,
      prorrataImporte: 0n,
      incluyePeriodo: true,
      hasta: "2026-07-10",
    });
  });

  it("7 y 8: cambio de día en una renovación manual", () => {
    expect(
      calcularPeriodo(
        entrada({ desde: fecha("2026-06-11"), diaVenc: 20, fechaEmision: fecha("2026-06-05") }),
      ),
    ).toMatchObject({ fechaObjetivo: "2026-06-20", prorrataDias: 10, hasta: "2026-07-20" });
    expect(
      calcularPeriodo(
        entrada({ desde: fecha("2026-06-21"), diaVenc: 10, fechaEmision: fecha("2026-06-15") }),
      ),
    ).toMatchObject({ fechaObjetivo: "2026-07-10", prorrataDias: 20, hasta: "2026-08-10" });
  });
});

describe("altas: solo el tramo hasta lo que el cliente ya tiene", () => {
  it("10: adicional de un cliente mensual al 10 → tramo hasta su vencimiento (17 días)", () => {
    const r = calcularPeriodo(
      entrada({
        tipo: "ALTA_ADICIONAL",
        desde: fecha("2026-05-25"),
        fechaEmision: fecha("2026-05-25"),
        mayorHasta: fecha("2026-06-10"),
      }),
    );
    expect(r).toMatchObject({
      prorrataDias: 17,
      prorrataImporte: centavos("17000"),
      incluyePeriodo: false,
      hasta: "2026-06-10",
    });
  });

  it("12: adicional en el trimestre inicial → hasta el fin del trimestre", () => {
    const r = calcularPeriodo(
      entrada({
        tipo: "ALTA_ADICIONAL",
        diaVenc: null,
        desde: fecha("2026-03-01"),
        mayorHasta: fecha("2026-03-22"),
      }),
    );
    expect(r).toMatchObject({ prorrataDias: 22, hasta: "2026-03-22" });
  });

  it("13: adicional mensual de un cliente anual → tramo de 232 días", () => {
    const r = calcularPeriodo(
      entrada({
        tipo: "ALTA_ADICIONAL",
        diaVenc: 20,
        desde: fecha("2026-09-01"),
        mayorHasta: fecha("2027-04-20"),
      }),
    );
    expect(r).toMatchObject({ prorrataDias: 232, prorrataImporte: centavos("232000") });
  });

  it("14: alta inicial de un grupo → el primer 10 cuya corrida colectiva no pasó", () => {
    const grupo = (desde: string, emision: string) =>
      calcularPeriodo(
        entrada({
          tipo: "ALTA_GRUPO",
          desde: fecha(desde),
          fechaEmision: fecha(emision),
          diaCorteColectiva: 2,
        }),
      );
    expect(grupo("2026-05-15", "2026-05-15")).toMatchObject({
      fechaObjetivo: "2026-06-10",
      prorrataDias: 27,
      hasta: "2026-06-10",
    });
    // Después de la corrida del 2/6, va a la del mes siguiente.
    expect(grupo("2026-06-03", "2026-06-03")).toMatchObject({ fechaObjetivo: "2026-07-10" });
  });

  it("15 y 17: alta posterior a un grupo → hasta el vencimiento del grupo, sin mínimo", () => {
    const r = calcularPeriodo(
      entrada({
        tipo: "ALTA_GRUPO",
        desde: fecha("2026-06-01"),
        mayorHasta: fecha("2026-06-10"),
      }),
    );
    expect(r).toMatchObject({ prorrataDias: 10, hasta: "2026-06-10", incluyePeriodo: false });
  });

  it("sin día ni paquetes previos: período completo, sin tramo", () => {
    const r = calcularPeriodo(
      entrada({ tipo: "ALTA_ADICIONAL", diaVenc: null, desde: fecha("2026-03-01"), meses: 3 }),
    );
    expect(r).toEqual({
      fechaObjetivo: null,
      prorrataDias: 0,
      prorrataImporte: 0n,
      incluyePeriodo: true,
      hasta: "2026-05-31",
    });
  });
});

describe("plan permitido según la situación", () => {
  it("el primer alta de un cliente directo es trimestral; los grupos no tienen trimestre", () => {
    const base = { agrupado: false, planilla: false, tieneTemporales: false };
    expect(situacionAlta(base)).toBe("TRIMESTRE_INICIAL");
    expect(situacionAlta({ ...base, tieneTemporales: true })).toBe("ADICIONAL");
    expect(situacionAlta({ ...base, agrupado: true })).toBe("ADICIONAL");
    expect(situacionAlta({ ...base, agrupado: true, planilla: true })).toBe("GRUPO");
  });

  it("el trimestral solo en el alta inicial, y ahí es el único", () => {
    expect(planPermitido(3, "ALTA", "TRIMESTRE_INICIAL")).toBe(true);
    expect(planPermitido(1, "ALTA", "TRIMESTRE_INICIAL")).toBe(false);
    expect(planPermitido(3, "ALTA", "ADICIONAL")).toBe(false);
    expect(planPermitido(12, "ALTA", "GRUPO")).toBe(true);
    expect(planPermitido(3, "RENOVACION", "ADICIONAL")).toBe(false);
  });
});

describe("semáforo de renovaciones a negociar", () => {
  it("rojo vencido, amarillo dentro del umbral, verde el resto", () => {
    const hoy = fecha("2026-10-09");
    expect(semaforoNegociacion(fecha("2026-10-08"), hoy, 7)).toBe("ROJO");
    expect(semaforoNegociacion(fecha("2026-10-09"), hoy, 7)).toBe("AMARILLO");
    expect(semaforoNegociacion(fecha("2026-10-16"), hoy, 7)).toBe("AMARILLO");
    expect(semaforoNegociacion(fecha("2026-10-17"), hoy, 7)).toBe("VERDE");
  });
});
