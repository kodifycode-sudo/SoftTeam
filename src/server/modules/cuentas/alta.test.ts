import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { crearDbPglite, type Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { sembrarDatosBase } from "@/server/db/semilla";
import { confirmarAlta, type DatosAlta, esquemaDatosAlta, guardarSolicitudAlta } from "./alta";

let db: Db;

const datos: DatosAlta = esquemaDatosAlta.parse({
  tipoPersona: "JURIDICA",
  nombre: "Pérez, Ana",
  razonSocial: "Broker del Sur SRL",
  tipoSociedad: "SRL",
  cuit: "30-71234567-1",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  telefono: "+54 11 4444-5555",
  email: "Ana@BrokerDelSur.com",
  calle: "Av. Siempre Viva 742",
  ciudad: "Rosario",
  codigoPostal: "2000",
  provincia: "Santa Fe",
});

async function crearUsuario(email: string) {
  const id = crypto.randomUUID();
  await db.insert(t.usuarios).values({ id, name: "Ana", email, emailVerified: true });
  return id;
}

beforeAll(async () => {
  db = await crearDbPglite();
  await sembrarDatosBase(db, { demo: false });
});

describe("esquemaDatosAlta", () => {
  it("normaliza CUIT y mail", () => {
    expect(datos.cuit).toBe("30712345671");
    expect(datos.email).toBe("ana@brokerdelsur.com");
  });

  it("exige razón social a personas jurídicas y un CUIT válido", () => {
    const r = esquemaDatosAlta.safeParse({
      ...datos,
      razonSocial: undefined,
      cuit: "30-71234567-2",
    });
    expect(r.success).toBe(false);
    const campos = r.error?.issues.map((i) => i.path[0]);
    expect(campos).toEqual(expect.arrayContaining(["razonSocial", "cuit"]));
  });
});

describe("confirmarAlta", () => {
  it("crea cliente, empresa, oficina 01-001 y administrador en una sola operación", async () => {
    const usuarioId = await crearUsuario("ana@brokerdelsur.com");
    await guardarSolicitudAlta(db, usuarioId, datos);

    const { empresaId } = await confirmarAlta(db, usuarioId);

    const empresa = await db.query.empresas.findFirst({ where: eq(t.empresas.id, empresaId) });
    expect(empresa).toMatchObject({
      nombre: "Broker del Sur SRL",
      nombreCorto: "BROKER",
      tipoCliente: "DIRECTO",
    });
    const oficinas = await db.select().from(t.oficinas).where(eq(t.oficinas.empresaId, empresaId));
    expect(oficinas.map((o) => o.codigo)).toEqual(["001"]);
    const [admin] = await db
      .select()
      .from(t.colaboradores)
      .where(eq(t.colaboradores.empresaId, empresaId));
    expect(admin).toMatchObject({
      usuarioId,
      adminGeneral: true,
      adminComercial: true,
      adminOperativo: true,
    });
    const politicas = await db.query.politicasEmpresa.findFirst({
      where: eq(t.politicasEmpresa.empresaId, empresaId),
    });
    expect(politicas?.politicas.topeMensualPozoPorOficina).toBe(500);
  });

  it("es idempotente: confirmar dos veces no duplica nada", async () => {
    const usuarioId = await crearUsuario("otro@broker.com");
    await guardarSolicitudAlta(db, usuarioId, {
      ...datos,
      cuit: "20123456786",
      email: "otro@broker.com",
    });

    const primera = await confirmarAlta(db, usuarioId);
    const segunda = await confirmarAlta(db, usuarioId);

    expect(segunda.empresaId).toBe(primera.empresaId);
    const clientes = await db.select().from(t.clientes).where(eq(t.clientes.cuit, "20123456786"));
    expect(clientes).toHaveLength(1);
  });

  it("falla sin solicitud previa", async () => {
    const usuarioId = await crearUsuario("sin-solicitud@broker.com");
    await expect(confirmarAlta(db, usuarioId)).rejects.toThrow(/solicitud/);
  });
});
