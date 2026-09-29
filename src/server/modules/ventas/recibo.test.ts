import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { registrarPago } from "./ordenes";
import { obtenerRecibo } from "./recibo";

const HOY = fecha("2026-09-25");
let db: Db;
let usuarioId: string;
beforeAll(async () => {
  db = await crearDbDePrueba();
  usuarioId = (await db.query.usuarios.findFirst())!.id;
});

describe("recibo provisorio", () => {
  it("existe solo para la orden pagada, numerado con la orden y acotado a su empresa", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    expect(await obtenerRecibo(db, orden.id)).toBeUndefined();

    await registrarPago(db, orden.id, usuarioId, HOY);
    const recibo = await obtenerRecibo(db, orden.id, { empresaId: empresa.id });
    expect(recibo?.numeroRecibo).toBe(`R-${orden.numero}`);
    expect(recibo?.pagadoEn).toBeInstanceOf(Date);

    const otra = await crearEmpresaDePrueba(db);
    expect(await obtenerRecibo(db, orden.id, { empresaId: otra.empresa.id })).toBeUndefined();
    const pagada = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, orden.id) });
    expect(pagada?.estado).toBe("PAGADA");
  });
});
