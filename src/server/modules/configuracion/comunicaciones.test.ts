import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import { empresaCompleta } from "../integraciones/datos";
import {
  esquemaTipoComunicacion,
  guardarTipoComunicacion,
  listarTiposComunicacion,
} from "./comunicaciones";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

const SIN_MEDIOS = {
  sistema: false,
  portal: false,
  mail: false,
  sms: false,
  push: false,
  whatsapp: false,
};

const entrada = (cambios: Record<string, unknown> = {}) =>
  esquemaTipoComunicacion.parse({
    nombre: "Vencimiento de póliza",
    medios: { ...SIN_MEDIOS, mail: true, whatsapp: true },
    reglas: [
      {
        origen: "PRODUCTOR",
        destinos: ["ASEGURADO", "ASEGURADO"],
        autorizantes: ["ADMIN_OFICINA"],
      },
    ],
    activo: true,
    ...cambios,
  });

describe("tipos de comunicación", () => {
  it("valida medios y reglas", () => {
    const sin = esquemaTipoComunicacion.safeParse({
      nombre: "X y",
      medios: SIN_MEDIOS,
      reglas: [],
      activo: true,
    });
    expect(sin.error?.issues.map((i) => i.message)).toEqual([
      "Elegí al menos un medio.",
      "Agregá al menos quién la origina y a quién llega.",
    ]);
    const repetido = esquemaTipoComunicacion.safeParse({
      nombre: "Aviso",
      medios: { ...SIN_MEDIOS, mail: true },
      reglas: [
        { origen: "PRODUCTOR", destinos: ["ASEGURADO"], autorizantes: [] },
        { origen: "PRODUCTOR", destinos: ["ASEGURADO"], autorizantes: [] },
      ],
      activo: true,
    });
    expect(repetido.error?.issues[0]?.message).toBe(
      "Cada tipo de usuario puede originarla una sola vez.",
    );
    // Los repetidos dentro de una lista se quitan.
    expect(entrada().reglas[0]?.destinos).toEqual(["ASEGURADO"]);
  });

  it("numera por empresa, no repite nombres y llega a los productos con los códigos de la KB", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const r1 = await guardarTipoComunicacion(db, empresa.id, entrada(), "admin");
    const r2 = await guardarTipoComunicacion(
      db,
      empresa.id,
      entrada({ nombre: "Cumpleaños" }),
      "admin",
    );
    expect(r1.ok && r2.ok).toBe(true);
    expect(
      await guardarTipoComunicacion(
        db,
        empresa.id,
        entrada({ nombre: "VENCIMIENTO de póliza" }),
        "admin",
      ),
    ).toEqual({ ok: false, error: "NOMBRE_EXISTENTE" });

    const tipos = await listarTiposComunicacion(db, empresa.id);
    expect(tipos.map((x) => [x.codigo, x.nombre])).toEqual([
      [1, "Vencimiento de póliza"],
      [2, "Cumpleaños"],
    ]);

    // Editar conserva el código; desactivar lo manda al final.
    if (!r1.ok) throw new Error();
    await guardarTipoComunicacion(
      db,
      empresa.id,
      entrada({ id: r1.id, nombre: "Vencimientos", activo: false }),
      "admin",
    );
    const api = await empresaCompleta(db, empresa.numero);
    expect(api?.comunicaciones).toEqual([
      expect.objectContaining({ codigo: 2, nombre: "Cumpleaños", activo: true }),
      {
        codigo: 1,
        nombre: "Vencimientos",
        activo: false,
        medios: { ...SIN_MEDIOS, mail: true, whatsapp: true },
        reglas: [
          {
            origen: { tipo: "PRODUCTOR", codigo: 3 },
            destinos: [{ tipo: "ASEGURADO", codigo: 5 }],
            autorizantes: [{ tipo: "ADMIN_OFICINA", codigo: 10 }],
          },
        ],
      },
    ]);

    // Otra empresa no la puede tocar.
    const otra = await crearEmpresaDePrueba(db);
    expect(
      await guardarTipoComunicacion(db, otra.empresa.id, entrada({ id: r1.id }), "admin"),
    ).toEqual({ ok: false, error: "NO_EXISTE" });
  });
});
