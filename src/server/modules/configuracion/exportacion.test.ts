import { beforeAll, describe, expect, it } from "vitest";
import { aCsv } from "@/domain/exportacion/csv";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { importar } from "../importacion/importar";
import {
  codigosParaExportar,
  columnasCodigos,
  columnasProductores,
  columnasUsuarios,
  productoresParaExportar,
  usuariosParaExportar,
} from "./exportacion";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

const bytes = (texto: string) => new TextEncoder().encode(texto);

describe("exportaciones del portal", () => {
  it("usuarios, productores y códigos se pueden volver a importar sin errores", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    await db.insert(t.colaboradores).values({
      empresaId: empresa.id,
      nombre: "Ana Pérez",
      email: `ana.${empresa.numero}@broker.com.ar`,
      accesoProdigal: true,
    });
    const [productor] = await db
      .insert(t.productores)
      .values({
        empresaId: empresa.id,
        nombre: "Juan Gómez",
        tipoPersona: "FISICA",
        condicionIva: "MONOTRIBUTO",
        esOrganizador: true,
      })
      .returning();
    const aseguradora = await db.query.aseguradoras.findFirst();
    await db.insert(t.productorCodigos).values({
      productorId: productor!.id,
      aseguradoraId: aseguradora!.id,
      codigo: "A123",
      rol: "ORGANIZADOR",
    });

    const usuarios = await usuariosParaExportar(db, empresa.id);
    const productores = await productoresParaExportar(db, empresa.id);
    const codigos = await codigosParaExportar(db, empresa.id);
    expect(usuarios.some((u) => u.nombre === "Ana Pérez")).toBe(true);
    expect(productores).toHaveLength(1);
    expect(codigos).toEqual([expect.objectContaining({ productor: "Juan Gómez", codigo: "A123" })]);

    for (const [tipo, csv] of [
      ["usuarios", aCsv(usuarios, columnasUsuarios(empresa.numero))],
      ["productores", aCsv(productores, columnasProductores(empresa.numero))],
      ["codigos", aCsv(codigos, columnasCodigos(empresa.numero))],
    ] as const) {
      const r = await importar(db, tipo, bytes(csv), { confirmar: false }, "admin");
      expect({ tipo, error: r.errorGeneral, errores: r.errores }).toEqual({
        tipo,
        error: undefined,
        errores: [],
      });
      expect(r.filas).toBeGreaterThan(0);
    }
  });
});
