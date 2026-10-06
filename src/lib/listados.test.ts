import { describe, expect, it } from "vitest";
import {
  desplazamiento,
  hrefListado,
  leerListado,
  paginasVisibles,
  siguienteOrden,
} from "./listados";

const COLUMNAS = ["nombre", "alta"] as const;
const POR_DEFECTO = { columna: "alta", direccion: "desc" } as const;

describe("leerListado", () => {
  it("lee página y orden válidos", () => {
    expect(
      leerListado({ pagina: "3", orden: "nombre", dir: "desc" }, COLUMNAS, POR_DEFECTO),
    ).toEqual({
      pagina: { numero: 3, tamano: 25 },
      orden: { columna: "nombre", direccion: "desc" },
    });
  });

  it("cae en los valores por defecto ante datos inválidos", () => {
    for (const pagina of ["0", "-2", "1.5", "abc", undefined]) {
      expect(leerListado({ pagina }, COLUMNAS, POR_DEFECTO).pagina.numero).toBe(1);
    }
    expect(leerListado({ orden: "contraseña" }, COLUMNAS, POR_DEFECTO).orden).toEqual(POR_DEFECTO);
  });

  it("sin dirección, una columna elegida ordena ascendente", () => {
    expect(leerListado({ orden: "nombre", dir: "x" }, COLUMNAS, POR_DEFECTO).orden).toEqual({
      columna: "nombre",
      direccion: "asc",
    });
  });

  it("toma el primer valor si el parámetro viene repetido", () => {
    expect(leerListado({ pagina: ["2", "5"] }, COLUMNAS, POR_DEFECTO).pagina.numero).toBe(2);
  });
});

describe("desplazamiento", () => {
  it("salta las páginas anteriores", () => {
    expect(desplazamiento({ numero: 1, tamano: 25 })).toBe(0);
    expect(desplazamiento({ numero: 3, tamano: 25 })).toBe(50);
  });
});

describe("hrefListado", () => {
  it("conserva los filtros y cambia la página", () => {
    expect(hrefListado("/admin/clientes", { q: "sur", pagina: "2" }, { pagina: 3 })).toBe(
      "/admin/clientes?q=sur&pagina=3",
    );
  });

  it("la página 1 no se escribe", () => {
    expect(hrefListado("/admin/clientes", { q: "sur", pagina: "2" }, { pagina: 1 })).toBe(
      "/admin/clientes?q=sur",
    );
  });

  it("cambiar el orden vuelve a la primera página", () => {
    expect(hrefListado("/x", { pagina: "4", orden: "alta" }, { orden: "nombre", dir: "asc" })).toBe(
      "/x?orden=nombre&dir=asc",
    );
  });

  it("quita los vacíos y codifica los valores", () => {
    expect(hrefListado("/x", { q: "", estado: "A&B" }, { orden: undefined })).toBe(
      "/x?estado=A%26B",
    );
  });
});

describe("siguienteOrden", () => {
  it("invierte la columna actual y empieza ascendente en otra", () => {
    expect(siguienteOrden({ columna: "nombre", direccion: "asc" }, "nombre").direccion).toBe(
      "desc",
    );
    expect(siguienteOrden({ columna: "nombre", direccion: "desc" }, "nombre").direccion).toBe(
      "asc",
    );
    expect(siguienteOrden({ columna: "nombre", direccion: "desc" }, "alta")).toEqual({
      columna: "alta",
      direccion: "asc",
    });
  });
});

describe("paginasVisibles", () => {
  it("muestra todas cuando son pocas", () => {
    expect(paginasVisibles(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("marca los saltos con null", () => {
    expect(paginasVisibles(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });

  it("no deja un salto de una sola página", () => {
    expect(paginasVisibles(4, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
  });

  it("una sola página", () => {
    expect(paginasVisibles(1, 1)).toEqual([1]);
  });
});
