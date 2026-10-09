import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import { listarClientes } from "@/server/modules/cuentas/consultas";
import { listarOrdenes } from "@/server/modules/ventas/ordenes";
import { totalDe } from "./listados";

let db: Db;
const creados: string[] = [];
beforeAll(async () => {
  db = await crearDbDePrueba();
  for (let i = 0; i < 23; i++) creados.push((await crearEmpresaDePrueba(db)).cliente.nombre);
});

describe("listados paginados", () => {
  it("las páginas recorren todo el listado sin repetir ni saltear filas", async () => {
    const todos = await listarClientes(db);
    expect(todos.length).toBeGreaterThanOrEqual(23);

    const tamano = 10;
    const vistos: string[] = [];
    for (let numero = 1; numero <= Math.ceil(todos.length / tamano); numero++) {
      const pagina = await listarClientes(db, { pagina: { numero, tamano } });
      expect(pagina.length).toBeLessThanOrEqual(tamano);
      expect(totalDe(pagina)).toBe(todos.length);
      vistos.push(...pagina.map((c) => c.id));
    }
    expect(vistos).toEqual(todos.map((c) => c.id));
  });

  it("una página después de la última viene vacía", async () => {
    const pagina = await listarClientes(db, { pagina: { numero: 999, tamano: 25 } });
    expect(pagina).toEqual([]);
    expect(totalDe(pagina)).toBe(0);
  });

  it("el total respeta el filtro", async () => {
    // "Cliente 4" de "Cliente 47": entre 23 números seguidos hay una decena
    // completa. No se fija el texto: la numeración depende de otros archivos.
    const busqueda = creados[11]!.slice(0, -1);
    const pagina = await listarClientes(db, {
      busqueda,
      pagina: { numero: 1, tamano: 2 },
    });
    const todos = await listarClientes(db, { busqueda });
    expect(pagina).toHaveLength(2);
    expect(totalDe(pagina)).toBe(todos.length);
  });

  it("ordena por la columna elegida en las dos direcciones", async () => {
    const nombres = (filas: { nombre: string }[]) => filas.map((f) => f.nombre.toLowerCase());
    const asc = nombres(
      await listarClientes(db, { orden: { columna: "nombre", direccion: "asc" } }),
    );
    const desc = nombres(
      await listarClientes(db, { orden: { columna: "nombre", direccion: "desc" } }),
    );
    expect(asc).toEqual([...asc].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(desc).toEqual([...asc].reverse());

    const numeros = (
      await listarOrdenes(db, { orden: { columna: "numero", direccion: "asc" } })
    ).map((o) => o.numero);
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b));
  });

  it("sin página devuelve todo, más allá del tope de 200 que tenía antes", async () => {
    const ordenes = await listarOrdenes(db);
    const pagina = await listarOrdenes(db, { pagina: { numero: 1, tamano: 5 } });
    expect(ordenes.length).toBe(totalDe(pagina));
  });
});
