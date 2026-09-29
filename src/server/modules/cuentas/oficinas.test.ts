import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { type Alcance, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { POLITICAS_POR_DEFECTO } from "@/server/db/schema/configuracion";
import { empresaCompleta } from "../integraciones/datos";
import {
  crearOficina,
  editarOficina,
  esquemaEdicionOficina,
  listarOficinas,
  renombrarCanal,
} from "./oficinas";

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

const datos = (cambios: Record<string, unknown> = {}) =>
  esquemaEdicionOficina.parse({
    nombre: "Sucursal",
    telefono: "0341 444-5555",
    web: "https://broker.com.ar",
    activa: true,
    ...cambios,
  });

/** Empresa con dos oficinas en el canal Norte (y ninguna otra). */
async function conDosOficinas() {
  const { empresa } = await crearEmpresaDePrueba(db);
  await crearOficina(db, empresa.id, { nombre: "Centro", canalNuevo: "Norte" }, "x");
  const centro = (await db.query.oficinas.findFirst({
    where: and(eq(t.oficinas.empresaId, empresa.id), eq(t.oficinas.nombre, "Centro")),
  }))!;
  await crearOficina(db, empresa.id, { nombre: "Rosario", canalId: centro.canalId }, "x");
  const rosario = (await db.query.oficinas.findFirst({
    where: and(eq(t.oficinas.empresaId, empresa.id), eq(t.oficinas.nombre, "Rosario")),
  }))!;
  return { empresa, centro, rosario };
}

const actor = (alcance: Alcance) => ({ usuarioId: "u", alcance });

describe("edición de oficinas y canales", () => {
  it("edita datos y redes, y la desactiva conservando al menos una activa", async () => {
    const { empresa, centro, rosario } = await conDosOficinas();
    expect(
      await editarOficina(
        db,
        empresa.id,
        centro.id,
        datos({ nombre: "Centro Nuevo" }),
        actor(TODA_LA_EMPRESA),
      ),
    ).toEqual({ ok: true });
    const guardada = await db.query.oficinas.findFirst({ where: eq(t.oficinas.id, centro.id) });
    expect(guardada).toMatchObject({
      nombre: "Centro Nuevo",
      redes: { web: "https://broker.com.ar" },
    });

    expect(
      await editarOficina(
        db,
        empresa.id,
        centro.id,
        datos({ activa: false }),
        actor(TODA_LA_EMPRESA),
      ),
    ).toEqual({ ok: true });
    expect(
      await editarOficina(
        db,
        empresa.id,
        rosario.id,
        datos({ activa: false }),
        actor(TODA_LA_EMPRESA),
      ),
    ).toEqual({ ok: false, error: "ULTIMA_OFICINA" });
  });

  it("un delegado edita lo de su alcance; el de oficina no desactiva la suya", async () => {
    const { empresa, centro, rosario } = await conDosOficinas();
    const deCentro = actor({ tipo: "oficina", canalId: centro.canalId, oficinaId: centro.id });
    expect(await editarOficina(db, empresa.id, centro.id, datos(), deCentro)).toEqual({ ok: true });
    expect(
      await editarOficina(db, empresa.id, centro.id, datos({ activa: false }), deCentro),
    ).toEqual({ ok: false, error: "SIN_PERMISO" });
    expect(await editarOficina(db, empresa.id, rosario.id, datos(), deCentro)).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
    const delCanal = actor({ tipo: "canal", canalId: centro.canalId });
    expect(
      await editarOficina(db, empresa.id, rosario.id, datos({ activa: false }), delCanal),
    ).toEqual({ ok: true });

    expect(await renombrarCanal(db, empresa.id, centro.canalId, "Litoral", deCentro)).toBe(false);
    expect(await renombrarCanal(db, empresa.id, centro.canalId, "Litoral", delCanal)).toBe(true);
    const canal = await db.query.canales.findFirst({ where: eq(t.canales.id, centro.canalId) });
    expect(canal?.nombre).toBe("Litoral");
  });
});

describe("oficinas que notifican", () => {
  it("se marca por oficina y la política de la empresa manda en lo que reciben los productos", async () => {
    const { empresa, centro } = await conDosOficinas();
    expect(
      await editarOficina(
        db,
        empresa.id,
        centro.id,
        datos({ nombre: "Centro", notifica: false }),
        actor(TODA_LA_EMPRESA),
      ),
    ).toEqual({ ok: true });
    const notifica = async () =>
      Object.fromEntries(
        (await empresaCompleta(db, empresa.numero))!.oficinas.map((o) => [o.nombre, o.notifica]),
      );
    expect(await notifica()).toMatchObject({ Centro: false, Rosario: true });

    await db
      .insert(t.politicasEmpresa)
      .values({
        empresaId: empresa.id,
        politicas: { ...POLITICAS_POR_DEFECTO, oficinasNotifican: false },
      })
      .onConflictDoUpdate({
        target: t.politicasEmpresa.empresaId,
        set: { politicas: { ...POLITICAS_POR_DEFECTO, oficinasNotifican: false } },
      });
    expect(await notifica()).toMatchObject({ Centro: false, Rosario: false });
  });
});
