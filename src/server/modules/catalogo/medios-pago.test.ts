import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { crearMedioPago, type EntradaAltaMedioPago, esquemaAltaMedioPago } from "./medios-pago";

const ACTOR = "usuario-softeam";
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

const entrada = (datos: Partial<EntradaAltaMedioPago> = {}): EntradaAltaMedioPago => ({
  codigo: `M${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  nombre: "Medio de prueba",
  tipo: "TRANSFERENCIA",
  ajustePorcentaje: 0n,
  habilitadoAlta: true,
  habilitadoAdicional: true,
  habilitadoRenovacion: true,
  modosFacturacion: [1],
  activo: true,
  ...datos,
});

describe("alta de medios de pago", () => {
  it("lo crea al final de la lista, con lo que fija el tipo, y lo audita", async () => {
    const ordenes = await db.select({ orden: t.mediosPago.orden }).from(t.mediosPago);
    const maximo = Math.max(...ordenes.map((m) => m.orden));

    const alta = await crearMedioPago(
      db,
      entrada({ tipo: "LINK_MP", ajustePorcentaje: -500n, instrucciones: "" }),
      ACTOR,
    );
    if (!alta.ok) throw new Error(alta.error);

    const medio = await db.query.mediosPago.findFirst({ where: eq(t.mediosPago.id, alta.id) });
    expect(medio).toMatchObject({
      tipo: "LINK_MP",
      generaLink: true,
      planilla: false,
      paisId: null,
      instrucciones: null,
      ajustePorcentaje: -500n,
      orden: maximo + 1,
    });
    const auditoria = await db.query.auditoria.findFirst({
      where: and(eq(t.auditoria.entidad, "medio_pago"), eq(t.auditoria.entidadId, alta.id)),
    });
    expect(auditoria).toMatchObject({ accion: "alta", actorId: ACTOR });
  });

  it("un medio de planilla factura al grupo y no genera link", async () => {
    const alta = await crearMedioPago(
      db,
      entrada({ tipo: "PLANILLA", modosFacturacion: [3] }),
      ACTOR,
    );
    if (!alta.ok) throw new Error(alta.error);
    const medio = await db.query.mediosPago.findFirst({ where: eq(t.mediosPago.id, alta.id) });
    expect(medio).toMatchObject({ planilla: true, generaLink: false });
  });

  it("restringe a un país existente y rechaza uno que no existe", async () => {
    const conPais = await crearMedioPago(db, entrada({ paisId: "AR" }), ACTOR);
    if (!conPais.ok) throw new Error(conPais.error);
    const medio = await db.query.mediosPago.findFirst({ where: eq(t.mediosPago.id, conPais.id) });
    expect(medio?.paisId).toBe("AR");

    expect(await crearMedioPago(db, entrada({ paisId: "ZZ" }), ACTOR)).toEqual({
      ok: false,
      error: "PAIS_INEXISTENTE",
    });
  });

  it("rechaza un código repetido", async () => {
    expect(await crearMedioPago(db, entrada({ codigo: "TRANSF" }), ACTOR)).toEqual({
      ok: false,
      error: "CODIGO_EXISTENTE",
    });
  });
});

describe("esquema del alta", () => {
  const formulario = {
    codigo: " transf_2 ",
    nombre: "Transferencia en dólares",
    tipo: "TRANSFERENCIA",
    ajustePorcentaje: "2,5",
    habilitadoAlta: true,
    habilitadoAdicional: false,
    habilitadoRenovacion: true,
    modosFacturacion: [1],
    activo: true,
  };

  it("normaliza el código y convierte el ajuste", () => {
    const datos = esquemaAltaMedioPago.parse(formulario);
    expect(datos.codigo).toBe("TRANSF_2");
    expect(datos.ajustePorcentaje).toBe(250n);
  });

  it.each([
    ["un código con espacios", { codigo: "MI MEDIO" }, "codigo"],
    ["un tipo inexistente", { tipo: "EFECTIVO" }, "tipo"],
    ["ningún modo de facturación", { modosFacturacion: [] }, "modosFacturacion"],
  ])("rechaza %s", (_, cambio, campo) => {
    const resultado = esquemaAltaMedioPago.safeParse({ ...formulario, ...cambio });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.map((i) => i.path[0])).toContain(campo);
  });
});
