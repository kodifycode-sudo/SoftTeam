import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { esquemaMedioEnvio, guardarMedioEnvio, listarMediosEnvio } from "./medios-envio";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

describe("medios de envío editables por SOFTeam", () => {
  it("interpreta el factor con coma y lo rechaza fuera de rango", () => {
    expect(esquemaMedioEnvio.parse({ id: "sms", factor: "2,5", activo: true }).factor).toBe(250);
    expect(esquemaMedioEnvio.safeParse({ id: "sms", factor: "0", activo: true }).success).toBe(
      false,
    );
    expect(esquemaMedioEnvio.safeParse({ id: "sms", factor: "abc", activo: true }).success).toBe(
      false,
    );
  });

  it("cambia el factor, desactiva y audita; el mail no se desactiva", async () => {
    expect(await guardarMedioEnvio(db, { id: "sms", factor: 300, activo: false }, "admin")).toEqual(
      {
        ok: true,
      },
    );
    const sms = (await listarMediosEnvio(db)).find((m) => m.id === "sms");
    expect(sms).toMatchObject({ factorCentesimos: 300, activo: false });
    const auditoria = await db.query.auditoria.findFirst({
      where: eq(t.auditoria.entidadId, "sms"),
    });
    expect(auditoria?.despues).toEqual({ factor: 3, activo: false });

    expect(
      await guardarMedioEnvio(db, { id: "mail", factor: 100, activo: false }, "admin"),
    ).toEqual({
      ok: false,
      error: "POR_DEFECTO",
    });
    expect(await guardarMedioEnvio(db, { id: "fax", factor: 100, activo: true }, "admin")).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
  });
});
