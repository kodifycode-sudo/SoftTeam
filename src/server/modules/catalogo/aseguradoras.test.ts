import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { cambiarAseguradora, listarAseguradorasEmpresa } from "../configuracion/aseguradoras";
import {
  type EntradaAseguradora,
  guardarAseguradora,
  listarCatalogoAseguradoras,
} from "./aseguradoras";

const HOY = fecha("2026-09-25");
const ACTOR = "usuario-softeam";
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

const entrada = (datos: Partial<EntradaAseguradora> = {}): EntradaAseguradora => ({
  nombre: "Aseguradora de Prueba",
  abreviatura: `P${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  interfazProdigalDisponible: true,
  interfazCotiwebDisponible: false,
  interfazDocumentosDisponible: false,
  activa: true,
  ...datos,
});

/** Empresa con licencia de interfaces que trabaja con la aseguradora y usa Prodigal. */
async function empresaQueLaUsa(aseguradoraId: string) {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  await crearContratoDePrueba(
    db,
    { empresaId: empresa.id, ordenId: orden.id },
    {
      codigoPaquete: "PRO-INICIAL",
      estado: "ACTIVO",
      desde: fecha("2026-09-01"),
      hasta: fecha("2026-12-31"),
    },
  );
  for (const cambio of ["trabaja", "prodigal"] as const) {
    expect(
      (await cambiarAseguradora(db, empresa.id, { aseguradoraId, cambio, valor: true }, ACTOR, HOY))
        .ok,
    ).toBe(true);
  }
  return empresa;
}

describe("catálogo de aseguradoras", () => {
  it("da de alta, normaliza la abreviatura y rechaza repetidas", async () => {
    const alta = await guardarAseguradora(db, entrada({ abreviatura: "NUEVA1" }), ACTOR);
    expect(alta.ok).toBe(true);
    expect(await guardarAseguradora(db, entrada({ abreviatura: "NUEVA1" }), ACTOR)).toEqual({
      ok: false,
      error: "ABREVIATURA_EXISTENTE",
    });
    // Una del semillero, con la abreviatura de otra.
    const sancor = await db.query.aseguradoras.findFirst({
      where: eq(t.aseguradoras.abreviatura, "SANCOR"),
    });
    expect(
      await guardarAseguradora(
        db,
        entrada({ id: sancor!.id, nombre: sancor!.nombre, abreviatura: "NUEVA1" }),
        ACTOR,
      ),
    ).toEqual({ ok: false, error: "ABREVIATURA_EXISTENTE" });

    const auditoria = await db.query.auditoria.findFirst({
      where: and(eq(t.auditoria.entidad, "aseguradora"), eq(t.auditoria.accion, "alta")),
    });
    expect(auditoria?.actorId).toBe(ACTOR);
  });

  it("editar una aseguradora avisa a los productos de las empresas que la usan", async () => {
    const alta = await guardarAseguradora(db, entrada(), ACTOR);
    if (!alta.ok) throw new Error(alta.error);
    const empresa = await empresaQueLaUsa(alta.id);
    const antes = await db.query.empresas.findFirst({ where: eq(t.empresas.id, empresa.id) });

    await new Promise((r) => setTimeout(r, 5));
    const edicion = await guardarAseguradora(
      db,
      entrada({ id: alta.id, nombre: "Nombre Nuevo", abreviatura: "NNUEVO" }),
      ACTOR,
    );
    expect(edicion).toEqual({ ok: true, id: alta.id });
    const despues = await db.query.empresas.findFirst({ where: eq(t.empresas.id, empresa.id) });
    expect(despues!.modificadaEn.getTime()).toBeGreaterThan(antes!.modificadaEn.getTime());
  });

  it("quitar la disponibilidad no desactiva la interfaz de quien ya la usa", async () => {
    const alta = await guardarAseguradora(db, entrada(), ACTOR);
    if (!alta.ok) throw new Error(alta.error);
    const empresa = await empresaQueLaUsa(alta.id);
    const abreviatura = (await db.query.aseguradoras.findFirst({
      where: eq(t.aseguradoras.id, alta.id),
    }))!.abreviatura;

    await guardarAseguradora(
      db,
      entrada({ id: alta.id, abreviatura, interfazProdigalDisponible: false }),
      ACTOR,
    );
    const catalogo = await listarCatalogoAseguradoras(db);
    expect(catalogo.find((a) => a.id === alta.id)).toMatchObject({
      interfazProdigalDisponible: false,
      empresas: 1,
      conProdigal: 1,
    });
    const lista = await listarAseguradorasEmpresa(db, empresa.id, HOY);
    expect(lista.find((a) => a.id === alta.id)?.interfaces.prodigal).toMatchObject({
      vigente: true,
    });
  });

  it("una discontinuada no se puede activar, pero quien trabaja con ella la ve y la da de baja", async () => {
    const alta = await guardarAseguradora(db, entrada(), ACTOR);
    if (!alta.ok) throw new Error(alta.error);
    const usuaria = await empresaQueLaUsa(alta.id);
    const abreviatura = (await db.query.aseguradoras.findFirst({
      where: eq(t.aseguradoras.id, alta.id),
    }))!.abreviatura;
    await guardarAseguradora(db, entrada({ id: alta.id, abreviatura, activa: false }), ACTOR);

    // Otra empresa: no la ve ni la puede activar.
    const { empresa: otra } = await crearEmpresaDePrueba(db);
    expect((await listarAseguradorasEmpresa(db, otra.id, HOY)).some((a) => a.id === alta.id)).toBe(
      false,
    );
    expect(
      await cambiarAseguradora(
        db,
        otra.id,
        { aseguradoraId: alta.id, cambio: "trabaja", valor: true },
        ACTOR,
        HOY,
      ),
    ).toMatchObject({ ok: false, error: "DISCONTINUADA" });

    // La que ya trabajaba: la ve marcada y puede darla de baja.
    const propia = (await listarAseguradorasEmpresa(db, usuaria.id, HOY)).find(
      (a) => a.id === alta.id,
    );
    expect(propia?.discontinuada).toBe(true);
    expect(
      (
        await cambiarAseguradora(
          db,
          usuaria.id,
          { aseguradoraId: alta.id, cambio: "trabaja", valor: false },
          ACTOR,
          HOY,
        )
      ).ok,
    ).toBe(true);
  });

  it("informa si la aseguradora a editar ya no existe", async () => {
    expect(await guardarAseguradora(db, entrada({ id: crypto.randomUUID() }), ACTOR)).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
  });
});
