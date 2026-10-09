import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import { empresaCompleta } from "../integraciones/datos";
import {
  esquemaMarca,
  guardarMarca,
  leerMarca,
  logoDeEmpresa,
  logoDeEmpresaPorNumero,
} from "./marca";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

describe("marca blanca", () => {
  it("valida los datos", () => {
    expect(esquemaMarca.safeParse({ colorPrimario: "azul" }).success).toBe(false);
    expect(esquemaMarca.safeParse({ web: "javascript:alert(1)" }).success).toBe(false);
    expect(esquemaMarca.parse({ colorPrimario: "#1D4ED8" }).colorPrimario).toBe("#1d4ed8");
  });

  it("guarda el logo validado y la expone en la API de productos", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const datos = esquemaMarca.parse({ nombreComercial: "Seguros Sur", colorPrimario: "#1d4ed8" });

    expect(
      await guardarMarca(
        db,
        empresa.id,
        datos,
        { accion: "REEMPLAZAR", bytes: new Uint8Array(Buffer.from("<svg/>")) },
        "actor",
      ),
    ).toEqual({ ok: false, error: "FORMATO_INVALIDO" });

    expect(
      await guardarMarca(
        db,
        empresa.id,
        datos,
        { accion: "REEMPLAZAR", bytes: new Uint8Array(PNG) },
        "actor",
      ),
    ).toEqual({ ok: true });
    const logo = await logoDeEmpresa(db, empresa.id);
    expect(logo).toMatchObject({ tipo: "image/png" });
    expect(logo?.bytes.equals(PNG)).toBe(true);
    expect((await logoDeEmpresaPorNumero(db, empresa.numero))?.hash).toBe(logo?.hash);
    expect(await logoDeEmpresaPorNumero(db, 999_999_999)).toBeUndefined();

    const api = await empresaCompleta(db, empresa.numero);
    expect(api?.marca).toMatchObject({
      nombreComercial: "Seguros Sur",
      colores: { primario: "#1d4ed8", secundario: null },
      logo: { tipo: "image/png", hash: logo?.hash },
    });
    expect(api?.marca?.logo?.url).toMatch(
      new RegExp(`^/api/v1/empresas/${empresa.numero}/logo\\?v=`),
    );

    // Guardar sin tocar el logo lo conserva; quitarlo lo borra.
    await guardarMarca(db, empresa.id, datos, { accion: "MANTENER" }, "actor");
    expect((await leerMarca(db, empresa.id))?.logoHash).toBe(logo?.hash);
    await guardarMarca(db, empresa.id, datos, { accion: "QUITAR" }, "actor");
    expect(await logoDeEmpresa(db, empresa.id)).toBeUndefined();
  });

  it("una empresa sin marca informa null", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    expect((await empresaCompleta(db, empresa.numero))?.marca).toBeNull();
  });
});
