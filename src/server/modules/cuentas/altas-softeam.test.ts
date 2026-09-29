import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import {
  altaClientePorSofteam,
  type EntradaAltaCliente,
  esquemaAltaCliente,
  nuevaEmpresaDeCliente,
} from "./altas-softeam";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

let secuencia = 0;
function cuitValido(): string {
  for (;;) {
    secuencia += 1;
    const base = `30${String(50_000_000 + secuencia).padStart(8, "0")}`;
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const resto = 11 - ([...base].reduce((s, d, i) => s + Number(d) * (pesos[i] ?? 0), 0) % 11);
    if (resto !== 10) return `${base}${resto === 11 ? 0 : resto}`;
  }
}

const entrada = (cambios: Partial<Record<string, unknown>> = {}): EntradaAltaCliente =>
  esquemaAltaCliente.parse({
    tipoPersona: "JURIDICA",
    nombre: "Corporativo del Sur SA",
    tipoSociedad: "SA",
    cuit: cuitValido(),
    condicionIva: "RESPONSABLE_INSCRIPTO",
    domicilioFiscal: {
      calle: "Mitre 500",
      ciudad: "Rosario",
      codigoPostal: "2000",
      provincia: "Santa Fe",
    },
    administrador: { nombre: "Carla Corp", email: `carla.${secuencia}@corp.com` },
    empresa: { tipoCliente: "CORPORATIVO", tipoInstalacion: "SAAS" },
    ...cambios,
  });

describe("altas por SOFTeam", () => {
  it("crea el cliente, su empresa con la oficina inicial y el administrador", async () => {
    const datos = entrada();
    const r = await altaClientePorSofteam(db, datos, "admin");
    if (!r.ok) throw new Error(r.error);

    const empresa = await db.query.empresas.findFirst({ where: eq(t.empresas.id, r.empresaId) });
    expect(empresa).toMatchObject({ nombre: "Corporativo del Sur SA", tipoCliente: "CORPORATIVO" });
    expect(await db.$count(t.oficinas, eq(t.oficinas.empresaId, r.empresaId))).toBe(1);
    expect(await db.$count(t.politicasEmpresa, eq(t.politicasEmpresa.empresaId, r.empresaId))).toBe(
      1,
    );
    const admin = await db.query.colaboradores.findFirst({
      where: eq(t.colaboradores.empresaId, r.empresaId),
    });
    expect(admin).toMatchObject({ email: datos.administrador.email, adminGeneral: true });
    expect(admin?.usuarioId).toBe(r.usuario.id);

    // El mismo CUIT: ya existe (se le agrega una empresa desde su ficha).
    expect(await altaClientePorSofteam(db, entrada({ cuit: datos.cuit }), "admin")).toEqual({
      ok: false,
      error: "CUIT_DUPLICADO",
      clienteId: r.clienteId,
    });

    // Una empresa más, con el mismo administrador: reutiliza su usuario.
    const otra = await nuevaEmpresaDeCliente(
      db,
      r.clienteId,
      {
        empresa: {
          nombre: "Corporativo Norte",
          tipoCliente: "DIRECTO",
          tipoInstalacion: "ON_PREMISE",
        },
        administrador: { nombre: "Carla Corp", email: datos.administrador.email },
      },
      "admin",
    );
    if (!otra.ok) throw new Error(otra.error);
    expect(otra.usuario.id).toBe(r.usuario.id);
    expect(await db.$count(t.empresas, eq(t.empresas.clienteId, r.clienteId))).toBe(2);
  });

  it("un mail de SOFTeam no puede administrar un cliente, y no se crea nada", async () => {
    await db.insert(t.usuarios).values({
      id: crypto.randomUUID(),
      name: "Soporte",
      email: "soporte.alta@softeam.com.ar",
      emailVerified: true,
      rolSofteam: "SOPORTE",
    });
    const datos = entrada({
      administrador: { nombre: "Soporte", email: "soporte.alta@softeam.com.ar" },
    });
    expect(await altaClientePorSofteam(db, datos, "admin")).toEqual({
      ok: false,
      error: "ES_SOFTEAM",
    });
    expect(
      await db.query.clientes.findFirst({ where: eq(t.clientes.cuit, datos.cuit) }),
    ).toBeUndefined();
  });
});
