import { eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { tendenciasTablero } from "./reportes";

const HOY = fecha("2026-10-06");
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
  // Fuera de la ventana de 12 meses, para que solo cuente lo que crea este test.
  await db.update(t.clientes).set({ creadoEn: new Date("2020-01-01T12:00:00Z") });
  await db.update(t.contratos).set({ activadoEn: null });
  await db.update(t.ordenes).set({ estado: "CANCELADA" });

  const alta = async (instante: string, cobrado?: bigint) => {
    const { cliente, orden } = await crearEmpresaDePrueba(db);
    await db
      .update(t.clientes)
      .set({ creadoEn: new Date(instante) })
      .where(eq(t.clientes.id, cliente.id));
    if (cobrado !== undefined) {
      await db
        .update(t.ordenes)
        .set({ estado: "PAGADA", total: cobrado, pagadaEn: new Date(instante) })
        .where(eq(t.ordenes.id, orden.id));
    } else {
      await db
        .update(t.ordenes)
        .set({ estado: "CANCELADA" })
        .where(inArray(t.ordenes.id, [orden.id]));
    }
  };
  await alta("2026-10-02T15:00:00Z", 30_000n); // este mes
  await alta("2026-10-06T20:00:00Z"); // hoy a la tarde en Argentina
  await alta("2026-09-03T15:00:00Z", 10_000n); // mismo tramo del mes anterior
  await alta("2026-09-20T15:00:00Z", 50_000n); // septiembre, fuera del tramo
  await alta("2026-08-10T15:00:00Z");
});

describe("tendencias del tablero", () => {
  it("arma las series de 12 meses, con el mes actual al final", async () => {
    const r = await tendenciasTablero(db, HOY);
    expect(r.meses).toHaveLength(12);
    expect(r.meses.at(-1)).toBe("2026-10");
    expect(r.altasClientes.slice(-3)).toEqual([1, 2, 2]);
    expect(r.cobrado.slice(-3)).toEqual([0n, 60_000n, 30_000n]);
  });

  it("compara el mes en curso con el mismo tramo del mes anterior", async () => {
    const { comparacion } = await tendenciasTablero(db, HOY);
    expect(comparacion.altasClientes).toEqual({ actual: 2, anterior: 1 });
    expect(comparacion.cobrado).toEqual({ actual: 30_000n, anterior: 10_000n });
  });
});
