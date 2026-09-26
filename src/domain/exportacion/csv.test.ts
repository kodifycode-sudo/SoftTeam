import { describe, expect, it } from "vitest";
import { aCsv, importeCsv, nombreArchivo } from "./csv";

describe("aCsv", () => {
  it("genera un CSV para Excel en español", () => {
    const csv = aCsv(
      [{ nombre: "Pérez; Ana", total: importeCsv(123456n), activo: true, nota: 'Dice "hola"' }],
      [
        { titulo: "Nombre", valor: (f) => f.nombre },
        { titulo: "Total", valor: (f) => f.total },
        { titulo: "Activo", valor: (f) => f.activo },
        { titulo: "Nota", valor: (f) => f.nota },
      ],
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1)).toBe(
      'Nombre;Total;Activo;Nota\r\n"Pérez; Ana";1234,56;Sí;"Dice ""hola"""\r\n',
    );
  });

  it("neutraliza fórmulas", () => {
    const csv = aCsv(
      [{ v: "=HYPERLINK(1)" }, { v: "-2+3" }, { v: "@x" }],
      [{ titulo: "V", valor: (f) => f.v }],
    );
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@x");
  });

  it("formatea importes y números con coma decimal", () => {
    expect(importeCsv(5n)).toBe("0,05");
    expect(importeCsv(-150n)).toBe("-1,50");
    expect(aCsv([{ n: 2.5 }], [{ titulo: "N", valor: (f) => f.n }])).toContain("2,5");
    // Un importe negativo no se toma por fórmula.
    expect(aCsv([{ v: importeCsv(-150n) }], [{ titulo: "V", valor: (f) => f.v }])).toContain(
      "\r\n-1,50\r\n",
    );
  });

  it("arma nombres de archivo seguros", () => {
    expect(nombreArchivo("Órdenes pendientes", "2026-09-26")).toBe(
      "ordenes-pendientes-2026-09-26.csv",
    );
  });
});
