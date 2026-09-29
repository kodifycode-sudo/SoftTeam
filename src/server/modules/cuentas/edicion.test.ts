import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import {
  type EntradaEdicionCliente,
  esquemaEdicionCliente,
  guardarCliente,
  guardarEmpresa,
} from "./edicion";

let db: Db;
const ADMIN = { usuarioId: "admin", administracion: true };
const COMERCIAL = { usuarioId: "comercial", administracion: false };

beforeAll(async () => {
  db = await crearDbDePrueba();
});

let secuencia = 0;
/** CUIT válido y único (dígito verificador módulo 11), como los reales. */
function cuitValido(): string {
  for (;;) {
    secuencia += 1;
    const base = `30${String(70_000_000 + secuencia).padStart(8, "0")}`;
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const resto = 11 - ([...base].reduce((s, d, i) => s + Number(d) * (pesos[i] ?? 0), 0) % 11);
    if (resto !== 10) return `${base}${resto === 11 ? 0 : resto}`;
  }
}

/** Empresa de prueba cuyo cliente tiene un CUIT válido (los de prueba no lo son). */
async function conClienteValido() {
  const datos = await crearEmpresaDePrueba(db);
  const cuit = cuitValido();
  await db.update(t.clientes).set({ cuit }).where(eq(t.clientes.id, datos.cliente.id));
  return { ...datos, cliente: { ...datos.cliente, cuit } };
}

/** Entrada válida a partir de lo guardado, con los cambios indicados. */
async function entradaDe(clienteId: string, cambios: Record<string, unknown> = {}) {
  const c = (await db.query.clientes.findFirst({ where: eq(t.clientes.id, clienteId) }))!;
  return esquemaEdicionCliente.parse({
    version: c.actualizadoEn.toISOString(),
    tipoPersona: c.tipoPersona,
    nombre: c.nombre,
    nombreFactura: c.nombreFactura,
    cuit: c.cuit,
    condicionIva: c.condicionIva,
    domicilioFiscal: {
      calle: c.domicilioFiscal.calle,
      ciudad: c.domicilioFiscal.ciudad,
      codigoPostal: c.domicilioFiscal.codigoPostal,
      provincia: "Santa Fe",
    },
    administrador: { nombre: "Ana Admin", email: "ana@test.com" },
    pagos: {},
    comercial: {},
    activo: c.activo,
    ...cambios,
  }) satisfies EntradaEdicionCliente;
}

describe("edición del cliente", () => {
  it("guarda los cambios, conserva el país y deja la auditoría con el valor anterior", async () => {
    const { cliente } = await conClienteValido();
    const entrada = await entradaDe(cliente.id, {
      nombreFactura: "Nuevo Nombre SRL",
      condicionIva: "MONOTRIBUTO",
      pagos: { nombre: "Pablo Pagos", email: "PAGOS@test.com" },
      observaciones: "Llamar a la tarde",
    });
    expect(await guardarCliente(db, cliente.id, entrada, COMERCIAL)).toEqual({ ok: true });

    const guardado = await db.query.clientes.findFirst({ where: eq(t.clientes.id, cliente.id) });
    expect(guardado).toMatchObject({
      nombreFactura: "Nuevo Nombre SRL",
      condicionIva: "MONOTRIBUTO",
      contactoPagos: { nombre: "Pablo Pagos", email: "pagos@test.com", telefono: null },
      contactoComercial: null,
      domicilioComercial: null,
      observaciones: "Llamar a la tarde",
    });
    expect(guardado?.domicilioFiscal.paisId).toBe("AR");
    const auditoria = await db.query.auditoria.findFirst({
      where: and(eq(t.auditoria.entidad, "cliente"), eq(t.auditoria.entidadId, cliente.id)),
    });
    expect(auditoria).toMatchObject({ accion: "modificacion", actorId: "comercial" });
    expect((auditoria?.antes as { nombreFactura: string }).nombreFactura).toBe(
      cliente.nombreFactura,
    );
  });

  it("rechaza cambios sobre una versión vieja (dos personas editando a la vez)", async () => {
    const { cliente } = await conClienteValido();
    const vieja = await entradaDe(cliente.id, { nombre: "Primero" });
    expect(await guardarCliente(db, cliente.id, vieja, ADMIN)).toEqual({ ok: true });
    expect(await guardarCliente(db, cliente.id, { ...vieja, nombre: "Segundo" }, ADMIN)).toEqual({
      ok: false,
      error: "CONFLICTO",
    });
  });

  it("el CUIT y la baja son solo de Administración, y el CUIT no se repite", async () => {
    const { cliente } = await conClienteValido();
    const { cliente: otro } = await conClienteValido();
    expect(
      await guardarCliente(
        db,
        cliente.id,
        await entradaDe(cliente.id, { cuit: cuitValido() }),
        COMERCIAL,
      ),
    ).toEqual({ ok: false, error: "SIN_PERMISO" });
    expect(
      await guardarCliente(
        db,
        cliente.id,
        await entradaDe(cliente.id, { activo: false }),
        COMERCIAL,
      ),
    ).toEqual({ ok: false, error: "SIN_PERMISO" });
    expect(
      await guardarCliente(db, cliente.id, await entradaDe(cliente.id, { cuit: otro.cuit }), ADMIN),
    ).toEqual({ ok: false, error: "CUIT_DUPLICADO" });
    expect(
      await guardarCliente(
        db,
        cliente.id,
        await entradaDe(cliente.id, { cuit: cuitValido() }),
        ADMIN,
      ),
    ).toEqual({ ok: true });
  });

  it("el domicilio comercial va completo o vacío", () => {
    const parcial = esquemaEdicionCliente.safeParse({
      version: "x",
      tipoPersona: "JURIDICA",
      nombre: "Empresa",
      nombreFactura: "Empresa",
      cuit: "20123456786",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "Calle 1",
        ciudad: "Rosario",
        codigoPostal: "2000",
        provincia: "Santa Fe",
      },
      domicilioComercial: { calle: "Otra 2" },
      administrador: { nombre: "Ana Admin", email: "ana@test.com" },
      pagos: {},
      comercial: {},
      activo: true,
    });
    expect(parcial.success).toBe(false);
  });
});

describe("edición de la empresa", () => {
  it("guarda, avisa a los productos y solo Administración la desactiva", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const version = () =>
      db.query.empresas
        .findFirst({ where: eq(t.empresas.id, empresa.id) })
        .then((e) => e!.actualizadoEn.toISOString());
    const base = {
      nombre: "Broker Norte",
      nombreCorto: "NORTE",
      tipoCliente: "CORPORATIVO" as const,
      tipoInstalacion: "SAAS" as const,
      activa: true,
    };
    const antes = empresa.modificadaEn;
    expect(
      await guardarEmpresa(db, empresa.id, { ...base, version: await version() }, COMERCIAL),
    ).toEqual({ ok: true });
    const guardada = await db.query.empresas.findFirst({ where: eq(t.empresas.id, empresa.id) });
    expect(guardada).toMatchObject({ nombre: "Broker Norte", tipoCliente: "CORPORATIVO" });
    expect(guardada!.modificadaEn.getTime()).toBeGreaterThanOrEqual(antes.getTime());

    expect(
      await guardarEmpresa(
        db,
        empresa.id,
        { ...base, activa: false, version: await version() },
        COMERCIAL,
      ),
    ).toEqual({ ok: false, error: "SIN_PERMISO" });
    expect(
      await guardarEmpresa(
        db,
        empresa.id,
        { ...base, activa: false, version: await version() },
        ADMIN,
      ),
    ).toEqual({ ok: true });
  });
});
