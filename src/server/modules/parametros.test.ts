import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { guardarParametro, leerParametroDe, leerParametros } from "./parametros";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

describe("parámetros del sistema", () => {
  it("guarda con la misma validación con que se leen, y deja la auditoría", async () => {
    expect(await guardarParametro(db, "renovacion.dias_corte", "8, 20", "admin")).toEqual({
      ok: true,
    });
    expect(await leerParametroDe(db, "renovacion.dias_corte")).toEqual([8, 20]);
    const auditoria = await db.query.auditoria.findFirst({
      where: eq(t.auditoria.entidadId, "renovacion.dias_corte"),
    });
    expect(auditoria).toMatchObject({ entidad: "parametro", despues: { valor: [8, 20] } });
  });

  it("rechaza valores que romperían los procesos", async () => {
    expect(await guardarParametro(db, "renovacion.dias_corte", "20, 8", "admin")).toEqual({
      ok: false,
      error: "El primer día tiene que ser anterior al segundo.",
    });
    expect(await guardarParametro(db, "alertas.vencimiento_dias", "7, 15, 1", "admin")).toEqual({
      ok: false,
      error: "Van de mayor a menor, sin repetir.",
    });
    expect(await guardarParametro(db, "cobranza.recordatorios_dias", "10, 10", "admin")).toEqual({
      ok: false,
      error: "Hay días repetidos.",
    });
    expect((await guardarParametro(db, "alertas.saldo_bajo_porcentaje", "abc", "admin")).ok).toBe(
      false,
    );
  });

  it("sí/no y valores por defecto", async () => {
    expect((await leerParametros(db))["oficinas.pedido_facturacion"]).toBe(false);
    await guardarParametro(db, "oficinas.pedido_facturacion", "on", "admin");
    expect(await leerParametroDe(db, "oficinas.pedido_facturacion")).toBe(true);
    // Un valor roto en la base no rompe: se usa el valor por defecto.
    await db
      .update(t.parametros)
      .set({ valor: "cualquier cosa" })
      .where(eq(t.parametros.clave, "cobranza.semaforo_dias"));
    expect(await leerParametroDe(db, "cobranza.semaforo_dias")).toEqual([10, 21]);
  });
});
