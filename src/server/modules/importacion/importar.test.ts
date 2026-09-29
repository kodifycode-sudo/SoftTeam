import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { crearCliente, crearEmpresa } from "../cuentas/creacion";
import { importar } from "./importar";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

let secuencia = 0;
function cuitValido(): string {
  for (;;) {
    secuencia += 1;
    const base = `30${String(60_000_000 + secuencia).padStart(8, "0")}`;
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const resto = 11 - ([...base].reduce((s, d, i) => s + Number(d) * (pesos[i] ?? 0), 0) % 11);
    if (resto !== 10) return `${base}${resto === 11 ? 0 : resto}`;
  }
}

const bytes = (texto: string) => new TextEncoder().encode(texto);
const importarTexto = (tipo: Parameters<typeof importar>[1], texto: string, confirmar = true) =>
  importar(db, tipo, bytes(texto), { confirmar }, "admin");

/** Cabecera de clientes con los títulos de la KB. */
const CABECERA_CLIENTES =
  "STLicClienteFacCUIT;STLicClienteNom;STLicClienteFacIVACod;STLicClienteFacDomi;STLicClienteFacDomiCiu;STLicClienteFacDomiCP;STLicClienteFacDomiPcia;STLicClienteAdminNom;STLicClienteAdminMail;STLicEmpresaCod;StLicEmpresasTipCliente";

describe("importación", () => {
  it("revisa sin guardar, e importa conservando el número de empresa de la KB", async () => {
    const cuit = cuitValido();
    const archivo = `${CABECERA_CLIENTES}\n${cuit};Broker Importado SA;1;Córdoba 100;Rosario;2000;Santa Fe;Ana Pérez;ana.importada@test.com;7001;Corporativo\n`;

    const revision = await importarTexto("clientes", archivo, false);
    expect(revision).toMatchObject({ confirmado: false, filas: 1, creados: 1, errores: [] });
    expect(await db.query.clientes.findFirst({ where: eq(t.clientes.cuit, cuit) })).toBeUndefined();

    const importacion = await importarTexto("clientes", archivo);
    expect(importacion).toMatchObject({ confirmado: true, creados: 1 });
    const empresa = await db.query.empresas.findFirst({ where: eq(t.empresas.numero, 7001) });
    expect(empresa).toMatchObject({ nombre: "Broker Importado SA", tipoCliente: "CORPORATIVO" });
    const admin = await db.query.colaboradores.findFirst({
      where: eq(t.colaboradores.empresaId, empresa!.id),
    });
    expect(admin).toMatchObject({ email: "ana.importada@test.com", adminGeneral: true });
    expect(admin?.usuarioId).not.toBeNull();
    expect(importacion.invitaciones.map((u) => u.email)).toEqual(["ana.importada@test.com"]);

    // Las altas nuevas no chocan con el número importado.
    const { id: clienteId } = await crearCliente(db, {
      tipoPersona: "JURIDICA",
      nombre: "Otro",
      cuit: cuitValido(),
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "a",
        ciudad: "b",
        codigoPostal: "1000",
        provincia: "Santa Fe",
        paisId: "AR",
      },
      contactoAdministrador: { nombre: "x", email: "x@test.com", telefono: null },
    });
    const nueva = await crearEmpresa(db, { clienteId, nombre: "Otra" });
    expect(nueva.numero).toBeGreaterThan(7001);

    // Volver a importar el mismo archivo no duplica.
    expect(await importarTexto("clientes", archivo)).toMatchObject({ creados: 0, existentes: 1 });
  });

  it("todo o nada: con una fila mala no guarda ninguna, y dice la línea", async () => {
    const buena = cuitValido();
    const archivo = [
      CABECERA_CLIENTES,
      `${buena};Bueno SA;RI;Calle 1;Rosario;2000;Santa Fe;Ana;ana.buena@test.com;;`,
      "20-12345678-5;Malo SA;RI;Calle 2;Rosario;2000;Santa Fe;Bea;bea@test.com;;",
      `${cuitValido()};Otro Malo;Otra cosa;Calle 3;Rosario;2000;Marte;Ceci;ceci@test.com;;`,
    ].join("\n");
    const r = await importarTexto("clientes", archivo);
    expect(r.confirmado).toBe(false);
    expect(r.errores).toEqual([
      { linea: 3, mensaje: 'CUIT: "20-12345678-5" no es un valor válido.' },
      { linea: 4, mensaje: 'Condición de IVA: "Otra cosa" no es un valor válido.' },
    ]);
    expect(
      await db.query.clientes.findFirst({ where: eq(t.clientes.cuit, buena) }),
    ).toBeUndefined();
  });

  it("rechaza entero un archivo que no está separado por punto y coma", async () => {
    const archivo = `${CABECERA_CLIENTES.replaceAll(";", ",")}\n${cuitValido()},Broker Coma SA,1\n`;
    const r = await importarTexto("clientes", archivo, false);
    expect(r.errorGeneral).toMatch(/separados por punto y coma \(;\) y este archivo usa comas/);
    expect(r.filas).toBe(0);
  });

  it("avisa las columnas obligatorias que faltan y las que ignora", async () => {
    const r = await importarTexto("clientes", "nombre;color\nA;rojo");
    expect(r.errorGeneral).toContain("Faltan columnas obligatorias: CUIT");
    expect(r.ignoradas).toEqual(["color"]);
  });

  it("migra una empresa completa: oficinas, usuarios, productores, catálogo y códigos", async () => {
    const cuit = cuitValido();
    await importarTexto(
      "clientes",
      `${CABECERA_CLIENTES}\n${cuit};Red Sur SA;RI;Mitre 1;Mendoza;5500;Mendoza;Juan;juan.redsur@test.com;7100;\n`,
    );
    // Archivo de Excel en Windows-1252 (con acentos).
    const oficinas = new Uint8Array([
      ...new TextEncoder().encode(
        "STLicEmpresaCod;STLicCanal;STLicCanalNom;STLicOficinaId;STLicOficinaNom\n7100;2;Sur;1;Mendoza Centro\n7100;2;Sur;2;San Rafael\n7100;1;;1;Casa Central Nueva\n7100;2;;3;Tunuy",
      ),
      0xe1, // á
      0x6e,
    ]);
    const r1 = await importar(db, "oficinas", oficinas, { confirmar: true }, "admin");
    expect(r1).toMatchObject({ confirmado: true, creados: 3, actualizados: 1 });
    expect(
      await db.query.oficinas.findFirst({ where: eq(t.oficinas.nombre, "Tunuyán") }),
    ).toBeDefined();

    const r2 = await importarTexto(
      "usuarios",
      "StLicUsuarioEmpresa;StLicUsuarioNom;StLicUsuarioMail;StLicUsuarioOficina;UsuarioAdministradorComercialSIno;UsuarioAccesoProdigalSino\n7100;Sara Sur;sara.sur@test.com;02-001;S;S\n7100;Pedro;pedro.sur@test.com;;N;S",
    );
    expect(r2).toMatchObject({ confirmado: true, creados: 2 });
    const sara = await db.query.colaboradores.findFirst({
      where: eq(t.colaboradores.email, "sara.sur@test.com"),
    });
    expect(sara).toMatchObject({ adminComercial: true, accesoProdigal: true });
    expect(sara?.oficinaId).not.toBeNull();

    await importarTexto(
      "aseguradoras",
      "AseguradoraId;AseguradoraNom;AseguradoraAbrev;AseguradoraInterfaseProdiCarteraSino\n900;Aseguradora Importada;IMPORT;S",
    );
    const r3 = await importarTexto(
      "productores",
      `STLicEmpresaCod;STLicProductorId;STLicProductorNom;STLicProductorCUIT;STLicProductorOficina;STLicProductorRolOrgSino\n7100;55;Gómez Seguros;20-12345678-6;02-002;S`,
    );
    expect(r3).toMatchObject({ confirmado: true, creados: 1 });
    const r4 = await importarTexto(
      "codigos",
      "STLicEmpresaCod;STLicProductorId;STLicProductorAsegruadoraId;STLicProductorxCia;STLicProductorRolOrgxCiaSino\n7100;55;900;ab-1;S\n7100;55;900;ab-1;S",
    );
    expect(r4).toMatchObject({ confirmado: true, creados: 1, existentes: 1 });
    const empresa = await db.query.empresas.findFirst({ where: eq(t.empresas.numero, 7100) });
    const trabaja = await db.query.empresaAseguradoras.findFirst({
      where: eq(t.empresaAseguradoras.empresaId, empresa!.id),
    });
    expect(trabaja?.activa).toBe(true);

    const r5 = await importarTexto(
      "empresaAseguradoras",
      "STLicEmpresaCod;STLicAseguradorasAbrev;STLicAseguradoraInterfaseProdiCarteraSino\n7100;IMPORT;S\n7100;NOEXISTE;S",
    );
    expect(r5.errores).toEqual([
      { linea: 3, mensaje: 'No existe la aseguradora "NOEXISTE". Importá primero el catálogo.' },
    ]);
    const r6 = await importarTexto(
      "empresaAseguradoras",
      "STLicEmpresaCod;STLicAseguradorasAbrev;STLicAseguradoraInterfaseProdiCarteraSino\n7100;IMPORT;S",
    );
    expect(r6).toMatchObject({ confirmado: true, actualizados: 1 });
    const conInterfaz = await db.query.empresaAseguradoras.findFirst({
      where: and(
        eq(t.empresaAseguradoras.empresaId, empresa!.id),
        eq(t.empresaAseguradoras.interfazProdigal, true),
      ),
    });
    expect(conInterfaz).toBeDefined();
  });
});
