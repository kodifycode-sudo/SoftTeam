import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { type Alcance, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import {
  type Actor,
  cambiarEstadoColaborador,
  type EntradaColaborador,
  guardarColaborador,
  listarColaboradores,
  usuarioDeColaboradorActivo,
} from "../configuracion/colaboradores";
import { guardarProductor, listarProductores } from "../configuracion/productores";
import {
  avisosDeEmpresa,
  avisosSinLeer,
  marcarAvisosLeidos,
  type NuevaAlerta,
  registrarAlerta,
} from "../procesos/alertas";
import { incidentesDeEmpresa, obtenerIncidente, responderIncidente } from "../soporte/incidentes";
import { agregarAlCarrito, cantidadEnCarrito, listarCarrito } from "../ventas/carrito";
import { confirmarOrden } from "../ventas/checkout";
import { listarOrdenes, obtenerOrden } from "../ventas/ordenes";
import { crearOficina, listarOficinas } from "./oficinas";

const HOY = fecha("2026-09-25");
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

/** Empresa con dos canales: Norte (oficinas 01-001 y 01-002) y Sur (02-001). */
async function estructura() {
  const { empresa, cliente } = await crearEmpresaDePrueba(db);
  // La empresa de prueba trae una orden vacía: se borra para no mezclarla con las del test.
  await db.delete(t.ordenes).where(eq(t.ordenes.empresaId, empresa.id));
  const nueva = async (nombre: string, canal: { canalId?: string; canalNuevo?: string }) => {
    const r = await crearOficina(db, empresa.id, { nombre, ...canal }, "actor");
    if (!r.ok) throw new Error(r.error);
    return (await db.query.oficinas.findFirst({
      where: and(eq(t.oficinas.empresaId, empresa.id), eq(t.oficinas.nombre, nombre)),
    }))!;
  };
  const centro = await nueva("Centro", { canalNuevo: "Norte" });
  const rosario = await nueva("Rosario", { canalId: centro.canalId });
  const mendoza = await nueva("Mendoza", { canalNuevo: "Sur" });
  const alcances = {
    canalNorte: { tipo: "canal", canalId: centro.canalId } satisfies Alcance,
    centro: { tipo: "oficina", canalId: centro.canalId, oficinaId: centro.id } satisfies Alcance,
  };
  return { empresa, cliente, centro, rosario, mendoza, alcances };
}

const actor = (alcance: Alcance, extra: Partial<Actor> = {}): Actor => ({
  usuarioId: `usuario-${Math.random().toString(36).slice(2)}`,
  colaboradorId: crypto.randomUUID(),
  adminGeneral: false,
  adminComercial: false,
  adminOperativo: true,
  alcance,
  ...extra,
});

const colaborador = (alcance: string, datos: Partial<EntradaColaborador> = {}) =>
  ({
    nombre: "Persona de prueba",
    email: `p.${Math.random().toString(36).slice(2)}@test.com`,
    alcance,
    adminGeneral: false,
    adminComercial: false,
    adminOperativo: false,
    accesoProdigal: false,
    accesoCotiweb: false,
    accesoBienseguro: false,
    accesoBoletin: false,
    ...datos,
  }) satisfies EntradaColaborador;

async function alternativa(codigoPaquete: string, nombre: string) {
  const [fila] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(and(eq(t.paquetes.codigo, codigoPaquete), eq(t.alternativas.nombre, nombre)));
  return fila!.id;
}

describe("administradores delegados", () => {
  it("un delegado de oficina solo ve y gestiona los usuarios de su oficina", async () => {
    const { empresa, centro, rosario, alcances } = await estructura();
    const general = actor(TODA_LA_EMPRESA, { adminGeneral: true });
    const enCentro = await guardarColaborador(
      db,
      empresa.id,
      colaborador(`oficina:${centro.id}`),
      general,
      HOY,
    );
    const enRosario = await guardarColaborador(
      db,
      empresa.id,
      colaborador(`oficina:${rosario.id}`),
      general,
      HOY,
    );
    await guardarColaborador(db, empresa.id, colaborador("empresa"), general, HOY);
    if (!enCentro.ok || !enRosario.ok) throw new Error("no se crearon");

    const delegado = actor(alcances.centro);
    expect((await listarColaboradores(db, empresa.id, delegado.alcance)).map((c) => c.id)).toEqual([
      enCentro.id,
    ]);
    // Alta en su oficina: sí. En toda la empresa u otra oficina: no.
    expect(
      (await guardarColaborador(db, empresa.id, colaborador(`oficina:${centro.id}`), delegado, HOY))
        .ok,
    ).toBe(true);
    for (const fuera of ["empresa", `canal:${centro.canalId}`, `oficina:${rosario.id}`]) {
      expect(
        await guardarColaborador(db, empresa.id, colaborador(fuera), delegado, HOY),
      ).toMatchObject({
        ok: false,
        error: "ALCANCE_INVALIDO",
      });
    }
    // Un usuario de otra oficina no existe para él.
    expect(
      await cambiarEstadoColaborador(db, empresa.id, enRosario.id, false, delegado, HOY),
    ).toMatchObject({
      ok: false,
      error: "NO_EXISTE",
    });
    // Reenviar el acceso: solo a los de su oficina, de esta empresa y activos
    // (y con usuario de login, que se crea al darle algún permiso).
    const conAcceso = (alcance: string) =>
      guardarColaborador(
        db,
        empresa.id,
        colaborador(alcance, { adminOperativo: true }),
        general,
        HOY,
      );
    const centroConAcceso = await conAcceso(`oficina:${centro.id}`);
    const rosarioConAcceso = await conAcceso(`oficina:${rosario.id}`);
    if (!centroConAcceso.ok || !rosarioConAcceso.ok) throw new Error("no se crearon");
    const reenvio = (id: string, empresaId = empresa.id) =>
      usuarioDeColaboradorActivo(db, empresaId, delegado.alcance, id);
    expect(await reenvio(centroConAcceso.id)).toMatchObject({ nombre: "Persona de prueba" });
    expect(await reenvio(enCentro.id)).toBeUndefined();
    expect(await reenvio(rosarioConAcceso.id)).toBeUndefined();
    expect(await reenvio(centroConAcceso.id, crypto.randomUUID())).toBeUndefined();
    await cambiarEstadoColaborador(db, empresa.id, centroConAcceso.id, false, general, HOY);
    expect(await reenvio(centroConAcceso.id)).toBeUndefined();
  });

  it("un delegado de canal gestiona las oficinas de su canal", async () => {
    const { empresa, rosario, mendoza, alcances } = await estructura();
    const delegado = actor(alcances.canalNorte);
    expect(
      (
        await guardarColaborador(
          db,
          empresa.id,
          colaborador(`oficina:${rosario.id}`),
          delegado,
          HOY,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await guardarColaborador(
          db,
          empresa.id,
          colaborador(`canal:${alcances.canalNorte.canalId}`),
          delegado,
          HOY,
        )
      ).ok,
    ).toBe(true);
    expect(
      await guardarColaborador(db, empresa.id, colaborador(`oficina:${mendoza.id}`), delegado, HOY),
    ).toMatchObject({
      ok: false,
      error: "ALCANCE_INVALIDO",
    });
    expect((await listarOficinas(db, empresa.id, delegado.alcance)).map((o) => o.nombre)).toEqual([
      "Centro",
      "Rosario",
    ]);
  });

  it("el administrador general siempre tiene toda la empresa", async () => {
    const { empresa, centro } = await estructura();
    const general = actor(TODA_LA_EMPRESA, { adminGeneral: true });
    expect(
      await guardarColaborador(
        db,
        empresa.id,
        colaborador(`oficina:${centro.id}`, { adminGeneral: true }),
        general,
        HOY,
      ),
    ).toMatchObject({ ok: false, error: "GENERAL_TODA_LA_EMPRESA" });
  });

  it("productores: el delegado los asigna a sus oficinas y solo ve los suyos", async () => {
    const { empresa, centro, rosario, alcances } = await estructura();
    const base = {
      esProductor: true,
      esOrganizador: false,
      esSubproductor: false,
      agenteInstitorio: false,
    };
    await guardarProductor(
      db,
      empresa.id,
      { ...base, nombre: "De Rosario", oficinaId: rosario.id },
      "actor",
      HOY,
    );
    expect(
      await guardarProductor(
        db,
        empresa.id,
        { ...base, nombre: "Sin oficina" },
        "actor",
        HOY,
        alcances.centro,
      ),
    ).toEqual({ ok: false, error: "OFICINA_INVALIDA" });
    expect(
      await guardarProductor(
        db,
        empresa.id,
        { ...base, nombre: "Ajeno", oficinaId: rosario.id },
        "actor",
        HOY,
        alcances.centro,
      ),
    ).toEqual({ ok: false, error: "OFICINA_INVALIDA" });
    expect(
      (
        await guardarProductor(
          db,
          empresa.id,
          { ...base, nombre: "Del Centro", oficinaId: centro.id },
          "actor",
          HOY,
          alcances.centro,
        )
      ).ok,
    ).toBe(true);
    expect((await listarProductores(db, empresa.id, alcances.centro)).map((p) => p.nombre)).toEqual(
      ["Del Centro"],
    );
    expect(await listarProductores(db, empresa.id)).toHaveLength(2);
  });

  it("compra delegada: carrito propio, contratos asignados a la oficina y órdenes visibles solo para ella", async () => {
    const { empresa, cliente, centro, alcances } = await estructura();
    const usuarioId = (await db.query.usuarios.findFirst())!.id;
    const alt = await alternativa("PRO-INICIAL", "Trimestral inicial");
    // La empresa arma su propio carrito; la oficina, el suyo.
    await agregarAlCarrito(
      db,
      { empresaId: empresa.id, alternativaId: alt, cantidad: 1, usuarioId },
      HOY,
    );
    await agregarAlCarrito(
      db,
      { empresaId: empresa.id, oficinaId: centro.id, alternativaId: alt, cantidad: 2, usuarioId },
      HOY,
    );
    expect(await cantidadEnCarrito(db, empresa.id)).toBe(1);
    expect(await cantidadEnCarrito(db, empresa.id, centro.id)).toBe(2);

    const r = await confirmarOrden(
      db,
      {
        empresaId: empresa.id,
        oficinaId: centro.id,
        usuarioId,
        claveIdempotencia: crypto.randomUUID(),
      },
      HOY,
    );
    if (!r.ok) throw new Error(r.error);
    const contratos = await db.query.contratos.findMany({
      where: eq(t.contratos.ordenId, r.valor.ordenId),
    });
    expect(contratos.map((c) => c.oficinaId)).toEqual([centro.id]);
    // Solo se vació el carrito de la oficina.
    expect(await listarCarrito(db, empresa.id, centro.id)).toEqual([]);
    expect(await cantidadEnCarrito(db, empresa.id)).toBe(1);

    const deLaEmpresa = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!deLaEmpresa.ok) throw new Error(deLaEmpresa.error);

    const alcance = { empresaId: empresa.id, clienteId: cliente.id };
    expect(
      (await listarOrdenes(db, { ...alcance, alcance: alcances.centro })).map((o) => o.id),
    ).toEqual([r.valor.ordenId]);
    expect(
      (await listarOrdenes(db, { ...alcance, alcance: alcances.canalNorte })).map((o) => o.id),
    ).toEqual([r.valor.ordenId]);
    expect(await listarOrdenes(db, alcance)).toHaveLength(2);
    expect(
      await obtenerOrden(db, deLaEmpresa.valor.ordenId, { ...alcance, alcance: alcances.centro }),
    ).toBeUndefined();
  });

  it("avisos: el delegado ve los de sus oficinas y solo marca esos como leídos", async () => {
    const { empresa, centro, rosario, alcances } = await estructura();
    const usuarioId = (await db.query.usuarios.findFirst())!.id;
    const alt = await alternativa("PRO-INICIAL", "Trimestral inicial");
    const contratoDe = async (oficinaId: string | null) => {
      await agregarAlCarrito(
        db,
        { empresaId: empresa.id, oficinaId, alternativaId: alt, cantidad: 1, usuarioId },
        HOY,
      );
      const r = await confirmarOrden(
        db,
        { empresaId: empresa.id, oficinaId, usuarioId, claveIdempotencia: crypto.randomUUID() },
        HOY,
      );
      if (!r.ok) throw new Error(r.error);
      const contrato = await db.query.contratos.findFirst({
        where: eq(t.contratos.ordenId, r.valor.ordenId),
      });
      return { ordenId: r.valor.ordenId, contratoId: contrato!.id };
    };
    const delCentro = await contratoDe(centro.id);
    const deRosario = await contratoDe(rosario.id);
    const clave = () => crypto.randomUUID();
    const aviso = (mensaje: string, datos: Partial<NuevaAlerta>) =>
      registrarAlerta(db, {
        tipo: "VENCIMIENTO_7D",
        clave: clave(),
        mensaje,
        empresaId: empresa.id,
        ...datos,
      });
    await aviso("Contrato del centro", { contratoId: delCentro.contratoId });
    await aviso("Orden del centro", { ordenId: delCentro.ordenId });
    await aviso("Contrato de Rosario", { contratoId: deRosario.contratoId });
    await aviso("Respuesta al centro", { canalId: centro.canalId, oficinaId: centro.id });
    await aviso("Licencia de la empresa", {});

    const mensajes = async (alcance: Alcance) =>
      (await avisosDeEmpresa(db, empresa.id, 50, alcance)).map((a) => a.mensaje).sort();
    expect(await mensajes(alcances.centro)).toEqual([
      "Contrato del centro",
      "Orden del centro",
      "Respuesta al centro",
    ]);
    expect(await mensajes(alcances.canalNorte)).toHaveLength(4);
    expect(await mensajes(TODA_LA_EMPRESA)).toHaveLength(5);

    expect(await avisosSinLeer(db, empresa.id, alcances.centro)).toBe(3);
    await marcarAvisosLeidos(db, empresa.id, undefined, alcances.centro);
    expect(await avisosSinLeer(db, empresa.id, alcances.centro)).toBe(0);
    // Los de otras oficinas y los de la empresa siguen sin leer.
    expect(await avisosSinLeer(db, empresa.id)).toBe(2);
  });

  it("soporte: el delegado ve y responde solo los pedidos de su alcance", async () => {
    const { empresa, centro, rosario, alcances } = await estructura();
    const usuarioId = (await db.query.usuarios.findFirst())!.id;
    const pedido = async (asunto: string, canalId: string | null, oficinaId: string | null) => {
      const [fila] = await db
        .insert(t.incidentes)
        .values({
          empresaId: empresa.id,
          creadoPorId: usuarioId,
          producto: "stlic",
          asunto,
          canalId,
          oficinaId,
        })
        .returning({ id: t.incidentes.id });
      return fila!.id;
    };
    const delCentro = await pedido("Del centro", centro.canalId, centro.id);
    const deRosario = await pedido("De Rosario", rosario.canalId, rosario.id);
    await pedido("De la empresa", null, null);

    const asuntos = async (alcance: Alcance) =>
      (await incidentesDeEmpresa(db, empresa.id, alcance)).map((i) => i.asunto).sort();
    expect(await asuntos(alcances.centro)).toEqual(["Del centro"]);
    expect(await asuntos(alcances.canalNorte)).toEqual(["De Rosario", "Del centro"]);
    expect(await asuntos(TODA_LA_EMPRESA)).toHaveLength(3);

    const autor = { usuarioId, softeam: false, empresaId: empresa.id, alcance: alcances.centro };
    expect(
      await obtenerIncidente(db, deRosario, { empresaId: empresa.id, alcance: alcances.centro }),
    ).toBeUndefined();
    expect(await responderIncidente(db, deRosario, autor, { texto: "Hola" })).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
    expect(await responderIncidente(db, delCentro, autor, { texto: "Hola" })).toEqual({ ok: true });

    // La respuesta de Soporte le llega a la oficina que hizo el pedido.
    await responderIncidente(db, delCentro, { usuarioId, softeam: true }, { texto: "Listo" });
    expect(
      (await avisosDeEmpresa(db, empresa.id, 50, alcances.centro)).some((a) =>
        a.mensaje.includes("Del centro"),
      ),
    ).toBe(true);
  });
});
