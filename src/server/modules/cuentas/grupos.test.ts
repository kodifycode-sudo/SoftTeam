import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import {
  agregarAlGrupo,
  eliminarGrupo,
  guardarGrupo,
  listarGrupos,
  obtenerGrupo,
  quitarDelGrupo,
} from "./grupos";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

let n = 0;
const nombreCorto = () => `GRUPO${++n}`;

describe("grupos económicos", () => {
  it("crea el grupo con principal (que pasa a ser miembro) y facturación consolidada", async () => {
    const { cliente: principal } = await crearEmpresaDePrueba(db);
    const { cliente: aseguradora } = await crearEmpresaDePrueba(db);
    const r = await guardarGrupo(
      db,
      {
        nombre: "Red de la Aseguradora",
        nombreCorto: nombreCorto(),
        principal: String(principal.numero),
        facturacion: String(aseguradora.numero),
      },
      "admin",
    );
    if (!r.ok) throw new Error(r.error);
    const grupo = await obtenerGrupo(db, r.id);
    expect(grupo?.principal?.id).toBe(principal.id);
    expect(grupo?.facturacion?.id).toBe(aseguradora.id);
    expect(grupo?.miembros.map((m) => m.id)).toEqual([principal.id]);
    expect((await listarGrupos(db)).find((g) => g.id === r.id)?.miembros).toBe(1);
  });

  it("valida nombre corto repetido, clientes inexistentes o inactivos y miembros de otro grupo", async () => {
    const corto = nombreCorto();
    await guardarGrupo(db, { nombre: "Uno", nombreCorto: corto }, "admin");
    expect(await guardarGrupo(db, { nombre: "Dos", nombreCorto: corto }, "admin")).toEqual({
      ok: false,
      error: "NOMBRE_CORTO_EXISTENTE",
    });
    expect(
      await guardarGrupo(
        db,
        { nombre: "Tres", nombreCorto: nombreCorto(), principal: "99999" },
        "admin",
      ),
    ).toEqual({ ok: false, error: "PRINCIPAL_INEXISTENTE" });

    const { cliente: inactivo } = await crearEmpresaDePrueba(db);
    await db.update(t.clientes).set({ activo: false }).where(eq(t.clientes.id, inactivo.id));
    expect(
      await guardarGrupo(
        db,
        { nombre: "Cuatro", nombreCorto: nombreCorto(), facturacion: String(inactivo.numero) },
        "admin",
      ),
    ).toEqual({ ok: false, error: "FACTURACION_INACTIVA" });

    const a = await guardarGrupo(db, { nombre: "A", nombreCorto: nombreCorto() }, "admin");
    const b = await guardarGrupo(db, { nombre: "B", nombreCorto: nombreCorto() }, "admin");
    if (!a.ok || !b.ok) throw new Error("no se crearon");
    const { cliente } = await crearEmpresaDePrueba(db);
    expect(await agregarAlGrupo(db, a.id, String(cliente.numero), "admin")).toMatchObject({
      ok: true,
    });
    expect(await agregarAlGrupo(db, b.id, String(cliente.numero), "admin")).toEqual({
      ok: false,
      error: "EN_OTRO_GRUPO",
    });
  });

  it("sacar al principal deja el grupo sin principal; solo se borra vacío", async () => {
    const { cliente } = await crearEmpresaDePrueba(db);
    const r = await guardarGrupo(
      db,
      { nombre: "Chico", nombreCorto: nombreCorto(), principal: String(cliente.numero) },
      "admin",
    );
    if (!r.ok) throw new Error(r.error);
    expect(await eliminarGrupo(db, r.id, "admin")).toEqual({ ok: false, error: "CON_MIEMBROS" });
    expect(await quitarDelGrupo(db, r.id, cliente.id, "admin")).toBe(true);
    expect((await obtenerGrupo(db, r.id))?.clientePrincipalId).toBeNull();
    expect(await eliminarGrupo(db, r.id, "admin")).toEqual({ ok: true });
    expect(await obtenerGrupo(db, r.id)).toBeUndefined();
  });
});
