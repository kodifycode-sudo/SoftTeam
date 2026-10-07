import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { guardarPoliticas } from "../configuracion/politicas";
import { actividadDeEmpresa, actorAutomatico, guardarNotas, notasDeEmpresa } from "./actividad";

let db: Db;
let adminId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  const admin = await db.query.usuarios.findFirst({
    where: eq(t.usuarios.rolSofteam, "ADMINISTRACION"),
  });
  adminId = admin!.id;
});

describe("notas de SOFTeam", () => {
  it("el cliente no ve las líneas internas", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    await guardarNotas(db, empresa.id, "Atiende Juan.\n* Cliente difícil con los pagos.", adminId);
    expect(await notasDeEmpresa(db, empresa.id, true)).toContain("Cliente difícil");
    expect(await notasDeEmpresa(db, empresa.id, false)).toBe("Atiende Juan.");
  });
});

describe("histórico de actividad", () => {
  it("registra los cambios de la empresa y oculta a SOFTeam ante el cliente", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const clienteId = `cliente-${empresa.id}`;
    await db.insert(t.usuarios).values({
      id: clienteId,
      name: "Ana Cliente",
      email: `ana.${empresa.numero}@test.com`,
      emailVerified: true,
    });
    await guardarPoliticas(
      db,
      empresa.id,
      {
        oficinasNotifican: true,
        oficinasUsanPozoEmpresa: true,
        topeMensualPozoPorOficina: null,
        oficinasContratan: false,
      },
      clienteId,
    );
    await guardarNotas(db, empresa.id, "Nota interna", adminId);

    const paraSofteam = await actividadDeEmpresa(db, empresa.id, { esSofteam: true });
    expect(paraSofteam.map((a) => a.entidad)).toEqual(["notas", "politicas"]);
    expect(paraSofteam[0]?.actor).toBe("Administración SOFTeam");

    const paraCliente = await actividadDeEmpresa(db, empresa.id, { esSofteam: false });
    expect(paraCliente).toMatchObject([
      { entidad: "politicas", actor: "Ana Cliente", despues: null },
    ]);

    // Dice sobre qué fue el cambio; el enlace (al panel de SOFTeam) solo para SOFTeam.
    expect(paraSofteam[1]?.objeto).toEqual({
      texto: empresa.nombre,
      href: `/admin/clientes/${empresa.clienteId}`,
    });
    expect(paraCliente[0]?.objeto).toEqual({ texto: empresa.nombre });
  });
});

describe("actores automáticos", () => {
  it("tienen nombres legibles", () => {
    expect(actorAutomatico("facturador:simulador")).toBe("Facturación automática");
    expect(actorAutomatico("pasarela")).toBe("Pago en línea");
    expect(actorAutomatico("job:renovacion")).toBe("Renovación automática");
    expect(actorAutomatico("job:diario")).toBe("Proceso automático");
  });
});
