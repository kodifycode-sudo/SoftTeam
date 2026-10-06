import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { referenciasAuditoria } from "./auditoria-referencias";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

describe("referencias de la auditoría", () => {
  it("nombra y enlaza lo que cambió, con su empresa", async () => {
    const { cliente, empresa, orden } = await crearEmpresaDePrueba(db);
    const [aseguradora] = await db.select().from(t.aseguradoras).limit(1);
    const registros = [
      { id: 1, entidad: "orden", entidadId: orden.id, empresaId: empresa.id },
      { id: 2, entidad: "cliente", entidadId: cliente.id, empresaId: null },
      {
        id: 3,
        entidad: "empresa_aseguradora",
        entidadId: `${empresa.id}:${aseguradora!.abreviatura}`,
        empresaId: null,
      },
      { id: 4, entidad: "politicas", entidadId: empresa.id, empresaId: empresa.id },
      { id: 5, entidad: "parametro", entidadId: "cobranza.semaforo_dias", empresaId: null },
    ];
    const refs = await referenciasAuditoria(db, registros);
    const fichaCliente = `/admin/clientes/${cliente.id}`;

    expect(refs.get(1)).toEqual({
      objeto: { texto: `Orden #${orden.numero}`, href: `/admin/ordenes/${orden.id}` },
      empresa: { texto: empresa.nombre, href: fichaCliente },
    });
    expect(refs.get(2)).toEqual({ objeto: { texto: cliente.nombre, href: fichaCliente } });
    expect(refs.get(3)).toEqual({
      objeto: { texto: aseguradora!.nombre },
      empresa: { texto: empresa.nombre, href: fichaCliente },
    });
    // La configuración de la empresa la nombra una sola vez.
    expect(refs.get(4)).toEqual({ objeto: { texto: empresa.nombre, href: fichaCliente } });
    expect(refs.get(5)).toEqual({ objeto: { texto: "cobranza.semaforo_dias" } });
  });

  it("lo que ya no existe o tiene un id raro queda sin referencia, sin fallar", async () => {
    const refs = await referenciasAuditoria(db, [
      { id: 1, entidad: "orden", entidadId: randomUUID(), empresaId: null },
      { id: 2, entidad: "cliente", entidadId: "no-es-un-uuid", empresaId: null },
      { id: 3, entidad: "desconocida", entidadId: "x", empresaId: randomUUID() },
    ]);
    expect(refs.get(1)).toEqual({});
    expect(refs.get(2)).toEqual({});
    expect(refs.get(3)).toEqual({});
  });

  it("sin registros no consulta nada", async () => {
    expect((await referenciasAuditoria(db, [])).size).toBe(0);
  });
});
