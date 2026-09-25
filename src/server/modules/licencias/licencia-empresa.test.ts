import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { licenciaDeEmpresa } from "./licencia-empresa";

const HOY = fecha("2026-09-25");

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

const item = (licencia: Awaited<ReturnType<typeof licenciaDeEmpresa>>, recursoId: string) =>
  licencia.productos.flatMap((p) => p.items).find((i) => i.recursoId === recursoId);

describe("licenciaDeEmpresa", () => {
  it("suma solo los contratos vigentes, multiplicando por la cantidad", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    const ctx = { empresaId: empresa.id, ordenId: orden.id };
    await crearContratoDePrueba(db, ctx, {
      codigoPaquete: "PRO-INICIAL",
      estado: "ACTIVO",
      desde: fecha("2026-09-01"),
      hasta: fecha("2026-09-30"),
      cantidad: 2,
    });
    // Vencido: no suma.
    await crearContratoDePrueba(db, ctx, {
      codigoPaquete: "PRO-INICIAL",
      estado: "ACTIVO",
      desde: fecha("2026-08-01"),
      hasta: fecha("2026-08-31"),
    });
    // Impago: no suma.
    await crearContratoDePrueba(db, ctx, {
      codigoPaquete: "PRO-FULL",
      estado: "PEND_PAGO",
      desde: fecha("2026-09-01"),
      hasta: fecha("2026-09-30"),
    });

    const licencia = await licenciaDeEmpresa(db, empresa.id, HOY);

    expect(item(licencia, "prodigal.usuarios")?.total).toBe(4);
    expect(item(licencia, "prodigal.institorio")).toBeUndefined();
    expect(licencia.contratosVigentes).toHaveLength(1);
    expect(licencia.productos.map((p) => p.productoId)).toEqual(["prodigal"]);
  });

  it("un corporativo habilitado sin pago suma durante su período", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db, { tipoCliente: "CORPORATIVO" });
    await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "CW-PRO",
        estado: "PEND_PAGO_ACTIVO",
        desde: fecha("2026-09-10"),
        hasta: fecha("2026-10-09"),
      },
    );
    const licencia = await licenciaDeEmpresa(db, empresa.id, HOY);
    expect(item(licencia, "cotiweb.usuarios")?.total).toBe(4);
    // Regla derivada: 4 usuarios de CotiWeb habilitan la emisión.
    expect(item(licencia, "cotiweb.emision")?.total).toBe(1);
  });

  it("descuenta del cupo lo consumido en el mes y muestra el saldo prepago", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    const ctx = { empresaId: empresa.id, ordenId: orden.id };
    const base = await crearContratoDePrueba(db, ctx, {
      codigoPaquete: "BS-BASE",
      estado: "ACTIVO",
      desde: fecha("2026-09-01"),
      hasta: fecha("2026-09-30"),
    });
    const prepago = await crearContratoDePrueba(db, ctx, {
      codigoPaquete: "NOTI-10K",
      estado: "ACTIVO",
      desde: fecha("2026-09-01"),
      hasta: null,
    });
    await db.insert(t.movimientosSaldo).values([
      {
        contratoId: base.id,
        recursoId: "notificaciones.mes",
        clase: "CUPO_MENSUAL",
        tipo: "CONSUMO",
        creditos: -300,
        periodo: "2026-09",
      },
      // Consumo del mes anterior: no afecta el cupo de este mes.
      {
        contratoId: base.id,
        recursoId: "notificaciones.mes",
        clase: "CUPO_MENSUAL",
        tipo: "CONSUMO",
        creditos: -900,
        periodo: "2026-08",
      },
      {
        contratoId: prepago.id,
        recursoId: "notificaciones.saldo",
        clase: "SALDO",
        tipo: "CARGA",
        creditos: 10000,
      },
      {
        contratoId: prepago.id,
        recursoId: "notificaciones.saldo",
        clase: "SALDO",
        tipo: "CONSUMO",
        creditos: -2500,
      },
    ]);

    const licencia = await licenciaDeEmpresa(db, empresa.id, HOY);

    expect(item(licencia, "notificaciones.mes")).toMatchObject({ total: 1000, disponible: 700 });
    expect(item(licencia, "notificaciones.saldo")).toMatchObject({
      total: 10000,
      disponible: 7500,
    });
  });

  it("un consumible sin saldo deja de estar vigente", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      { codigoPaquete: "NOTI-10K", estado: "ACTIVO", desde: fecha("2026-09-01"), hasta: null },
    );
    const licencia = await licenciaDeEmpresa(db, empresa.id, HOY);
    expect(licencia.productos).toEqual([]);
    expect(licencia.contratosVigentes).toEqual([]);
  });
});
