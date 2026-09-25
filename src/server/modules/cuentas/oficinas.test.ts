import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { crearOficina, listarOficinas } from "./oficinas";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

describe("crearOficina", () => {
  it("numera oficinas dentro del canal y crea canales nuevos", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const [canal] = await db
      .insert(t.canales)
      .values({ empresaId: empresa.id, codigo: "01", nombre: "Casa central" })
      .returning();
    await db
      .insert(t.oficinas)
      .values({ empresaId: empresa.id, canalId: canal!.id, codigo: "001", nombre: "Casa central" });

    expect(
      await crearOficina(db, empresa.id, { nombre: "Sucursal Norte", canalId: canal!.id }, "actor"),
    ).toEqual({
      ok: true,
      codigo: "01-002",
    });
    expect(
      await crearOficina(
        db,
        empresa.id,
        { nombre: "Productor Gómez", canalNuevo: "Productores" },
        "actor",
      ),
    ).toEqual({
      ok: true,
      codigo: "02-001",
    });
    const oficinas = await listarOficinas(db, empresa.id);
    expect(oficinas.map((o) => `${o.canalCodigo}-${o.codigo}`)).toEqual([
      "01-001",
      "01-002",
      "02-001",
    ]);
  });

  it("no permite usar el canal de otra empresa", async () => {
    const a = await crearEmpresaDePrueba(db);
    const b = await crearEmpresaDePrueba(db);
    const [canalAjeno] = await db
      .insert(t.canales)
      .values({ empresaId: b.empresa.id, codigo: "01", nombre: "Ajeno" })
      .returning();
    expect(
      await crearOficina(db, a.empresa.id, { nombre: "Intrusa", canalId: canalAjeno!.id }, "actor"),
    ).toEqual({
      ok: false,
      error: "CANAL_INVALIDO",
    });
  });
});
