import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { darDeBajaContrato } from "./baja-contrato";
import { licenciaDeEmpresa } from "./licencia-empresa";

const HOY = fecha("2026-10-10");
let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

async function conContrato(estado: "ACTIVO" | "PEND_PAGO" = "ACTIVO") {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  const contrato = await crearContratoDePrueba(
    db,
    { empresaId: empresa.id, ordenId: orden.id },
    {
      codigoPaquete: "PRO-INICIAL",
      estado,
      desde: estado === "ACTIVO" ? fecha("2026-10-01") : null,
      hasta: estado === "ACTIVO" ? fecha("2026-10-31") : null,
    },
  );
  return { empresa, orden, contrato };
}

describe("baja de un contrato", () => {
  it("deja de contar para la licencia, no se renueva y queda el motivo", async () => {
    const { empresa, contrato } = await conContrato();
    expect((await licenciaDeEmpresa(db, empresa.id, HOY)).contratosVigentes).toHaveLength(1);
    expect(
      await darDeBajaContrato(db, contrato.id, "El cliente deja Prodigal", "admin", HOY),
    ).toEqual({
      ok: true,
      empresaId: empresa.id,
    });
    expect((await licenciaDeEmpresa(db, empresa.id, HOY)).contratosVigentes).toEqual([]);
    const guardado = await db.query.contratos.findFirst({ where: eq(t.contratos.id, contrato.id) });
    expect(guardado).toMatchObject({ estado: "BAJA", noRenovar: true });
    expect(guardado?.observaciones).toContain("El cliente deja Prodigal");
    // Una sola vez.
    expect(await darDeBajaContrato(db, contrato.id, "Otra vez", "admin", HOY)).toEqual({
      ok: false,
      error: "NO_ACTIVO",
    });
  });

  it("exige motivo, solo activos, y no si ya tiene la renovación generada", async () => {
    const { contrato } = await conContrato();
    expect(await darDeBajaContrato(db, contrato.id, "  ", "admin", HOY)).toEqual({
      ok: false,
      error: "FALTA_MOTIVO",
    });
    const pendiente = await conContrato("PEND_PAGO");
    expect(
      await darDeBajaContrato(db, pendiente.contrato.id, "No pagó nunca", "admin", HOY),
    ).toEqual({
      ok: false,
      error: "NO_ACTIVO",
    });

    const { empresa, orden, contrato: conRenovacion } = await conContrato();
    const renovacion = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      { codigoPaquete: "PRO-INICIAL", estado: "PEND_PAGO", desde: null, hasta: null },
    );
    await db
      .update(t.contratos)
      .set({ contratoAnteriorId: conRenovacion.id })
      .where(eq(t.contratos.id, renovacion.id));
    expect(await darDeBajaContrato(db, conRenovacion.id, "Se va", "admin", HOY)).toEqual({
      ok: false,
      error: "TIENE_RENOVACION",
    });
  });
});
