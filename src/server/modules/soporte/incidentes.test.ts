import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import {
  abrirIncidente,
  asignarIncidente,
  bandejaDeSoporte,
  cambiarEstadoIncidente,
  creditosDeSoporte,
  type EntradaIncidente,
  obtenerAdjunto,
  obtenerIncidente,
  responderIncidente,
} from "./incidentes";

const HOY = fecha("2026-10-10");
let db: Db;
let soporteId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  const admin = await db.query.usuarios.findFirst({
    where: eq(t.usuarios.rolSofteam, "ADMINISTRACION"),
  });
  soporteId = admin!.id;
});

const pedido = (asunto = "No puedo emitir pólizas"): EntradaIncidente => ({
  producto: "prodigal",
  asunto,
  prioridad: "MEDIA",
  texto: "Al emitir aparece un error de conexión con la aseguradora.",
});

/** Empresa con un usuario cliente y, opcionalmente, un paquete. */
async function preparar(paquete?: string) {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  const usuarioId = `cliente-${empresa.id}`;
  await db.insert(t.usuarios).values({
    id: usuarioId,
    name: "Ana Cliente",
    email: `ana.${empresa.numero}@test.com`,
    emailVerified: true,
  });
  if (paquete) {
    await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: paquete,
        estado: "ACTIVO",
        desde: fecha("2026-10-01"),
        hasta: paquete === "SOPORTE-10" ? null : fecha("2026-10-31"),
      },
    );
  }
  const ctx = { empresaId: empresa.id, empresaNumero: empresa.numero, usuarioId };
  return { empresa, orden, ctx };
}

describe("créditos de soporte", () => {
  it("sin créditos no se abre el pedido ni se descuenta nada", async () => {
    const { ctx } = await preparar();
    expect(await abrirIncidente(db, ctx, pedido(), HOY)).toEqual({
      ok: false,
      error: "SIN_CREDITOS",
    });
    expect(await db.$count(t.incidentes, eq(t.incidentes.empresaId, ctx.empresaId))).toBe(0);
    expect(await db.$count(t.consumos, eq(t.consumos.empresaId, ctx.empresaId))).toBe(0);
  });

  it("usa el cupo del mes y después el saldo", async () => {
    const { empresa, orden, ctx } = await preparar("PRO-INICIAL"); // 2 por mes
    expect((await abrirIncidente(db, ctx, pedido("Uno"), HOY)).ok).toBe(true);
    expect((await abrirIncidente(db, ctx, pedido("Dos"), HOY)).ok).toBe(true);
    expect(await abrirIncidente(db, ctx, pedido("Tres"), HOY)).toMatchObject({
      error: "SIN_CREDITOS",
    });
    const antes = await creditosDeSoporte(db, empresa.id, HOY);
    expect(antes).toMatchObject({ mes: { total: 2, disponible: 0 }, disponibles: 0 });

    // Con un paquete de 10 tickets sin vencimiento, sigue desde el saldo.
    const saldo = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      { codigoPaquete: "SOPORTE-10", estado: "ACTIVO", desde: fecha("2026-10-01"), hasta: null },
    );
    await db.insert(t.movimientosSaldo).values({
      contratoId: saldo.id,
      recursoId: "soporte.saldo",
      clase: "SALDO",
      tipo: "CARGA",
      creditos: 10,
    });
    expect((await abrirIncidente(db, ctx, pedido("Tres"), HOY)).ok).toBe(true);
    expect(await creditosDeSoporte(db, empresa.id, HOY)).toMatchObject({
      saldo: { total: 10, disponible: 9 },
      disponibles: 9,
    });
  });
});

describe("conversación y estados", () => {
  it("SOFTeam responde, el cliente contesta y cierra; las notas internas no se ven", async () => {
    const { ctx } = await preparar("PRO-FULL");
    const abierto = await abrirIncidente(db, ctx, pedido(), HOY);
    if (!abierto.ok) throw new Error();
    const soporte = { usuarioId: soporteId, softeam: true };
    const cliente = { usuarioId: ctx.usuarioId, softeam: false, empresaId: ctx.empresaId };

    await responderIncidente(db, abierto.id, soporte, {
      texto: "Revisamos la interfaz con la aseguradora.",
    });
    await responderIncidente(db, abierto.id, soporte, {
      texto: "Es un problema del lado de la compañía.",
      interno: true,
    });
    let visto = await obtenerIncidente(db, abierto.id, { empresaId: ctx.empresaId });
    expect(visto).toMatchObject({
      estado: "ESPERANDO_CLIENTE",
      asignadoA: "Administración SOFTeam",
    });
    expect(visto?.mensajes.map((m) => m.deSofteam)).toEqual([false, true]);
    // El cliente recibe un aviso de la respuesta.
    const avisos = await db.select().from(t.alertas).where(eq(t.alertas.empresaId, ctx.empresaId));
    expect(avisos.map((a) => a.tipo)).toContain("SOPORTE_RESPUESTA");

    await responderIncidente(db, abierto.id, cliente, { texto: "Gracias, quedo atento." });
    visto = await obtenerIncidente(db, abierto.id, { empresaId: ctx.empresaId });
    expect(visto?.estado).toBe("EN_CURSO");
    // SOFTeam ve todo, incluida la nota interna.
    expect((await obtenerIncidente(db, abierto.id, {}))?.mensajes).toHaveLength(4);

    // El cliente no puede marcarlo resuelto: solo cerrarlo.
    expect(await cambiarEstadoIncidente(db, abierto.id, cliente, "RESUELTO")).toEqual({
      ok: false,
      error: "SIN_PERMISO",
    });
    expect(await cambiarEstadoIncidente(db, abierto.id, cliente, "CERRADO")).toEqual({ ok: true });
    expect(await responderIncidente(db, abierto.id, soporte, { texto: "¿Algo más?" })).toEqual({
      ok: false,
      error: "CERRADO",
    });
  });

  it("una empresa no ve ni toca pedidos de otra", async () => {
    const a = await preparar("PRO-FULL");
    const b = await preparar("PRO-FULL");
    const abierto = await abrirIncidente(db, a.ctx, pedido(), HOY);
    if (!abierto.ok) throw new Error();
    expect(await obtenerIncidente(db, abierto.id, { empresaId: b.ctx.empresaId })).toBeUndefined();
    const intruso = { usuarioId: b.ctx.usuarioId, softeam: false, empresaId: b.ctx.empresaId };
    expect(await responderIncidente(db, abierto.id, intruso, { texto: "hola" })).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
  });

  it("la bandeja muestra primero lo urgente y filtra por asignación", async () => {
    const { ctx } = await preparar("PRO-FULL");
    const baja = await abrirIncidente(
      db,
      ctx,
      { ...pedido("Consulta baja"), prioridad: "BAJA" },
      HOY,
    );
    const alta = await abrirIncidente(
      db,
      ctx,
      { ...pedido("Caída total"), prioridad: "ALTA" },
      HOY,
    );
    if (!baja.ok || !alta.ok) throw new Error();
    const bandeja = await bandejaDeSoporte(db, { texto: "Caída total" });
    expect(bandeja[0]).toMatchObject({ id: alta.id, esperaSofteam: true });

    expect(await asignarIncidente(db, baja.id, soporteId, soporteId)).toBe(true);
    // Solo se asigna a personas de SOFTeam.
    expect(await asignarIncidente(db, baja.id, ctx.usuarioId, soporteId)).toBe(false);
    const mios = await bandejaDeSoporte(db, { asignadoAId: soporteId });
    expect(mios.map((i) => i.id)).toContain(baja.id);
    const sinAsignar = await bandejaDeSoporte(db, { asignadoAId: "SIN_ASIGNAR" });
    expect(sinAsignar.map((i) => i.id)).toContain(alta.id);
    expect(sinAsignar.map((i) => i.id)).not.toContain(baja.id);
  });
});

describe("adjuntos", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const PDF = new TextEncoder().encode("%PDF-1.7 nota interna");

  it("se guardan con el mensaje; el cliente no ve los de notas internas ni los de otra empresa", async () => {
    const { ctx } = await preparar("PRO-FULL");
    const abierto = await abrirIncidente(db, ctx, pedido("Error con captura"), HOY, [
      { nombre: "captura.png", tipo: "image/png", bytes: PNG },
    ]);
    if (!abierto.ok) throw new Error(abierto.error);
    await responderIncidente(
      db,
      abierto.id,
      { usuarioId: soporteId, softeam: true },
      {
        texto: "Log del servidor",
        interno: true,
        adjuntos: [{ nombre: "log.pdf", tipo: "application/pdf", bytes: PDF }],
      },
    );

    const paraSofteam = await obtenerIncidente(db, abierto.id, {});
    const [captura] = paraSofteam!.mensajes[0]!.adjuntos;
    const [log] = paraSofteam!.mensajes[1]!.adjuntos;
    expect(captura).toMatchObject({ nombre: "captura.png", tipo: "image/png", tamano: PNG.length });
    expect(log?.nombre).toBe("log.pdf");

    const deLaEmpresa = { empresaId: ctx.empresaId };
    expect((await obtenerAdjunto(db, captura!.id, deLaEmpresa))?.contenido).toEqual(
      Buffer.from(PNG),
    );
    expect(await obtenerAdjunto(db, log!.id, deLaEmpresa)).toBeUndefined();
    expect(await obtenerAdjunto(db, log!.id, {})).toMatchObject({ tipo: "application/pdf" });

    const otra = await preparar();
    expect(
      await obtenerAdjunto(db, captura!.id, { empresaId: otra.ctx.empresaId }),
    ).toBeUndefined();
  });
});
