import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { obtenerMovimientosContrato } from "./movimientos-contrato";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

describe("movimientos de un contrato", () => {
  it("lista el libro del más reciente al más antiguo, con el saldo después de cada uno", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    const prepago = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      { codigoPaquete: "NOTI-10K", estado: "ACTIVO", desde: fecha("2026-09-01"), hasta: null },
    );
    const base = {
      contratoId: prepago.id,
      recursoId: "notificaciones.saldo",
      clase: "SALDO",
    } as const;
    await db.insert(t.movimientosSaldo).values([
      { ...base, tipo: "CARGA", creditos: 10000 },
      { ...base, tipo: "CONSUMO", creditos: -300 },
      { ...base, tipo: "AJUSTE", creditos: 50, observacion: "Reintegro por falla" },
    ]);

    const r = await obtenerMovimientosContrato(db, prepago.id);
    expect(r?.contrato).toMatchObject({ empresaNumero: empresa.numero, estado: "ACTIVO" });
    expect(r?.movimientos.map((m) => [m.tipo, m.creditos, m.saldo])).toEqual([
      ["AJUSTE", 50, 9750],
      ["CONSUMO", -300, 9700],
      ["CARGA", 10000, 10000],
    ]);
    expect(r?.saldos).toEqual([expect.objectContaining({ periodo: null, saldo: 9750 })]);
    expect(await obtenerMovimientosContrato(db, crypto.randomUUID())).toBeNull();
  });
});
