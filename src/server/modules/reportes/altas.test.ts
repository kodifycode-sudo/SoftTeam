import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { rangoDeMeses } from "@/domain/reportes/periodos";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { altasDeClientes, altasPorMes } from "./altas";
import {
  cobranzaPorMes,
  consultaDeCuentas,
  empresaEnFiltro,
  filtroDeCuentas,
  ordenesPendientes,
} from "./reportes";

const HOY = fecha("2033-03-15");
const { meses, rango } = rangoDeMeses("2033-01", "2033-03", HOY);
const instante = (dia: string) => new Date(`${dia}T15:00:00Z`);
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
  await db.insert(t.paises).values({
    id: "UY",
    nombre: "Uruguay",
    prefijoTelefonico: "598",
    moneda: "ARS",
    alicuotaIvaGeneral: porcentaje("22"),
  });
});

/** Cliente dado de alta en `dia`, con su empresa. */
async function cliente(dia: string) {
  const creado = await crearEmpresaDePrueba(db);
  await db
    .update(t.clientes)
    .set({ creadoEn: instante(dia) })
    .where(eq(t.clientes.id, creado.cliente.id));
  return creado;
}

describe("filtro de cuentas", () => {
  it("ignora los parámetros inválidos y arma la consulta para exportar", () => {
    expect(filtroDeCuentas("x", "uy")).toEqual({ grupoId: undefined, paisId: undefined });
    const grupo = "0b8f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
    const filtro = filtroDeCuentas(grupo, "UY");
    expect(filtro).toEqual({ grupoId: grupo, paisId: "UY" });
    expect(consultaDeCuentas(filtro)).toBe(`&grupo=${grupo}&pais=UY`);
    expect(consultaDeCuentas({})).toBe("");
  });
});

describe("altas de clientes", () => {
  it("clasifica el origen y agrupa por mes, con filtro por grupo y país", async () => {
    // En línea: tiene una solicitud de alta confirmada.
    const enLinea = await cliente("2033-01-10");
    const usuarioId = crypto.randomUUID();
    await db.insert(t.usuarios).values({ id: usuarioId, name: "Ana", email: "ana@altas.test" });
    await db.insert(t.solicitudesAlta).values({
      usuarioId,
      datos: {},
      confirmadaEn: instante("2033-01-10"),
      clienteId: enLinea.cliente.id,
    });
    // Por SOFTeam: alta auditada desde el panel; además, empresa en Uruguay.
    const softeam = await cliente("2033-03-02");
    await db.insert(t.auditoria).values({
      actorTipo: "usuario",
      entidad: "cliente",
      entidadId: softeam.cliente.id,
      accion: "alta",
    });
    await db.update(t.empresas).set({ paisId: "UY" }).where(eq(t.empresas.id, softeam.empresa.id));
    // Importado, y miembro de un grupo.
    const importado = await cliente("2033-03-05");
    const [grupo] = await db
      .insert(t.gruposEconomicos)
      .values({ nombre: "Grupo Altas", nombreCorto: "GALTAS" })
      .returning();
    await db
      .update(t.clientes)
      .set({ grupoId: grupo!.id })
      .where(eq(t.clientes.id, importado.cliente.id));
    // Fuera del rango.
    await cliente("2032-12-31");

    const altas = await altasDeClientes(db, rango);
    const de = (id: string) => altas.find((a) => a.id === id);
    expect(de(enLinea.cliente.id)).toMatchObject({ origen: "EN_LINEA", mes: "2033-01" });
    expect(de(softeam.cliente.id)).toMatchObject({ origen: "SOFTEAM", paises: "Uruguay" });
    expect(de(importado.cliente.id)).toMatchObject({ origen: "IMPORTACION", grupo: "Grupo Altas" });
    expect(altas).toHaveLength(3);

    expect(altasPorMes(meses, altas)).toEqual([
      { mes: "2033-01", total: 1, EN_LINEA: 1, SOFTEAM: 0, IMPORTACION: 0 },
      { mes: "2033-02", total: 0, EN_LINEA: 0, SOFTEAM: 0, IMPORTACION: 0 },
      { mes: "2033-03", total: 2, EN_LINEA: 0, SOFTEAM: 1, IMPORTACION: 1 },
    ]);

    expect((await altasDeClientes(db, rango, { paisId: "UY" })).map((a) => a.id)).toEqual([
      softeam.cliente.id,
    ]);
    expect((await altasDeClientes(db, rango, { grupoId: grupo!.id })).map((a) => a.id)).toEqual([
      importado.cliente.id,
    ]);
  });
});

describe("filtros en cobranza y empresas", () => {
  it("limita las órdenes al grupo del cliente y las empresas al país", async () => {
    const delGrupo = await crearEmpresaDePrueba(db);
    const otro = await crearEmpresaDePrueba(db);
    const [grupo] = await db
      .insert(t.gruposEconomicos)
      .values({ nombre: "Grupo Cobranza", nombreCorto: "GCOBRA" })
      .returning();
    await db
      .update(t.clientes)
      .set({ grupoId: grupo!.id })
      .where(eq(t.clientes.id, delGrupo.cliente.id));
    for (const { orden } of [delGrupo, otro]) {
      await db
        .update(t.ordenes)
        .set({ total: centavos("1000"), emitidaEn: instante("2033-02-10") })
        .where(eq(t.ordenes.id, orden.id));
    }

    const filtro = { grupoId: grupo!.id };
    const [, febrero] = await cobranzaPorMes(db, meses, filtro);
    expect(febrero).toMatchObject({ ordenes: 1, emitido: centavos("1000") });
    const pendientes = await ordenesPendientes(db, HOY, filtro);
    expect(pendientes.map((p) => p.id)).toEqual([delGrupo.orden.id]);

    await db.update(t.empresas).set({ paisId: "UY" }).where(eq(t.empresas.id, otro.empresa.id));
    const uruguayas = await db
      .select({ id: t.empresas.id })
      .from(t.empresas)
      .where(empresaEnFiltro(t.empresas.id, { paisId: "UY" }));
    expect(uruguayas.map((e) => e.id)).toContain(otro.empresa.id);
    expect(uruguayas.map((e) => e.id)).not.toContain(delGrupo.empresa.id);
  });
});
