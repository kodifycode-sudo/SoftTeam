import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { listarAuditoria } from "../auditoria";
import { vincularColaboradores } from "../cuentas/usuarios";
import {
  cambiarRolSofteam,
  invitarUsuarioSofteam,
  listarUsuariosSofteam,
} from "../cuentas/usuarios-softeam";
import { cambiarAseguradora, listarAseguradorasEmpresa } from "./aseguradoras";
import {
  type Actor,
  cambiarEstadoColaborador,
  type EntradaColaborador,
  guardarColaborador,
} from "./colaboradores";
import { usoDeLimites } from "./limites";
import { guardarPoliticas, leerPoliticas } from "./politicas";
import { agregarCodigo, guardarProductor, listarProductores, quitarCodigo } from "./productores";

const HOY = fecha("2026-09-25");
let db: Db;

beforeAll(async () => {
  db = await crearDbDePrueba();
});

/** Empresa con un paquete vigente y su administrador general. */
async function preparar(codigoPaquete = "PRO-INICIAL") {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  await crearContratoDePrueba(
    db,
    { empresaId: empresa.id, ordenId: orden.id },
    { codigoPaquete, estado: "ACTIVO", desde: fecha("2026-09-01"), hasta: fecha("2026-12-31") },
  );
  const [admin] = await db
    .insert(t.colaboradores)
    .values({
      empresaId: empresa.id,
      nombre: "Admin",
      email: `admin.${empresa.numero}@test.com`,
      adminGeneral: true,
    })
    .returning();
  const actor: Actor = {
    usuarioId: `usuario-${empresa.numero}`,
    colaboradorId: admin!.id,
    adminGeneral: true,
    adminComercial: false,
    adminOperativo: false,
  };
  return { empresa, admin: admin!, actor };
}

const colaborador = (datos: Partial<EntradaColaborador> = {}): EntradaColaborador => ({
  nombre: "Ana Pérez",
  email: `ana.${Math.random().toString(36).slice(2)}@test.com`,
  alcance: "empresa",
  adminGeneral: false,
  adminComercial: false,
  adminOperativo: false,
  accesoProdigal: false,
  accesoCotiweb: false,
  accesoBienseguro: false,
  accesoBoletin: false,
  ...datos,
});

describe("colaboradores", () => {
  it("respeta los usuarios licenciados al activar accesos", async () => {
    const { empresa, actor } = await preparar(); // 2 usuarios de Prodigal
    const conProdigal = colaborador({ accesoProdigal: true });
    expect(await guardarColaborador(db, empresa.id, conProdigal, actor, HOY)).toMatchObject({
      ok: true,
    });
    const segundo = await guardarColaborador(
      db,
      empresa.id,
      colaborador({ accesoProdigal: true }),
      actor,
      HOY,
    );
    expect(segundo.ok).toBe(true);
    expect(
      await guardarColaborador(db, empresa.id, colaborador({ accesoProdigal: true }), actor, HOY),
    ).toMatchObject({ ok: false, error: "LIMITE_ALCANZADO", producto: "prodigal" });
    // Producto no licenciado.
    expect(
      await guardarColaborador(db, empresa.id, colaborador({ accesoCotiweb: true }), actor, HOY),
    ).toMatchObject({ ok: false, error: "SIN_LICENCIA", producto: "cotiweb" });

    // La baja libera el lugar; la reactivación vuelve a controlar.
    if (!segundo.ok) throw new Error();
    expect((await cambiarEstadoColaborador(db, empresa.id, segundo.id, false, actor, HOY)).ok).toBe(
      true,
    );
    const tercero = await guardarColaborador(
      db,
      empresa.id,
      colaborador({ accesoProdigal: true }),
      actor,
      HOY,
    );
    expect(tercero.ok).toBe(true);
    expect(
      await cambiarEstadoColaborador(db, empresa.id, segundo.id, true, actor, HOY),
    ).toMatchObject({ ok: false, error: "LIMITE_ALCANZADO" });

    const uso = await usoDeLimites(db, empresa.id, HOY);
    expect(uso.usuarios.prodigal).toMatchObject({ licenciados: 2, enUso: 2, licenciado: true });
  });

  it("editar un usuario que ya tenía el acceso no lo vuelve a contar", async () => {
    const { empresa, actor } = await preparar();
    const a = await guardarColaborador(
      db,
      empresa.id,
      colaborador({ accesoProdigal: true }),
      actor,
      HOY,
    );
    await guardarColaborador(db, empresa.id, colaborador({ accesoProdigal: true }), actor, HOY);
    if (!a.ok) throw new Error();
    const [fila] = await db.select().from(t.colaboradores).where(eq(t.colaboradores.id, a.id));
    expect(
      await guardarColaborador(
        db,
        empresa.id,
        colaborador({ id: a.id, email: fila!.email, nombre: "Ana P.", accesoProdigal: true }),
        actor,
        HOY,
      ),
    ).toMatchObject({ ok: true });
  });

  it("dar permisos de administración crea el usuario de login y pide invitarlo", async () => {
    const { empresa, actor } = await preparar();
    const email = `comercial.${empresa.numero}@test.com`;
    const resultado = await guardarColaborador(
      db,
      empresa.id,
      colaborador({ email, adminComercial: true }),
      actor,
      HOY,
    );
    expect(resultado).toMatchObject({
      ok: true,
      invitar: { email, verificado: false, nuevo: true },
    });
    if (!resultado.ok) throw new Error();
    const [fila] = await db
      .select()
      .from(t.colaboradores)
      .where(eq(t.colaboradores.id, resultado.id));
    const usuario = await db.query.usuarios.findFirst({ where: eq(t.usuarios.email, email) });
    expect(fila?.usuarioId).toBe(usuario?.id);

    // Guardar de nuevo sin cambiar permisos no reenvía la invitación.
    const otra = await guardarColaborador(
      db,
      empresa.id,
      colaborador({ id: resultado.id, email, adminComercial: true, telefono: "341 555-0000" }),
      actor,
      HOY,
    );
    expect(otra).toEqual({ ok: true, id: resultado.id });
  });

  it("solo un administrador general otorga permisos y la empresa conserva uno", async () => {
    const { empresa, admin, actor } = await preparar();
    const operativo: Actor = {
      ...actor,
      adminGeneral: false,
      adminOperativo: true,
      colaboradorId: "otro",
    };
    expect(
      await guardarColaborador(
        db,
        empresa.id,
        colaborador({ adminOperativo: true }),
        operativo,
        HOY,
      ),
    ).toMatchObject({ ok: false, error: "SIN_PERMISO" });
    // Un operativo sí da de alta usuarios sin permisos.
    expect(
      (
        await guardarColaborador(
          db,
          empresa.id,
          colaborador({ accesoProdigal: true }),
          operativo,
          HOY,
        )
      ).ok,
    ).toBe(true);
    // Nadie se da de baja a sí mismo.
    expect(
      await cambiarEstadoColaborador(db, empresa.id, admin.id, false, actor, HOY),
    ).toMatchObject({ ok: false, error: "PROPIO" });
    // Otro general no puede dejar a la empresa sin ninguno.
    const otroGeneral: Actor = { ...actor, colaboradorId: "externo" };
    expect(
      await cambiarEstadoColaborador(db, empresa.id, admin.id, false, otroGeneral, HOY),
    ).toMatchObject({ ok: false, error: "ULTIMO_ADMIN" });
  });

  it("valida mail único en la empresa, usuario Prodigal único y alcance propio", async () => {
    const { empresa, actor } = await preparar();
    const otra = await preparar();
    const email = `repetido.${empresa.numero}@test.com`;
    await guardarColaborador(
      db,
      empresa.id,
      colaborador({ email, usuarioProdigal: `U${empresa.numero}` }),
      actor,
      HOY,
    );
    expect(
      await guardarColaborador(db, empresa.id, colaborador({ email }), actor, HOY),
    ).toMatchObject({
      error: "EMAIL_DUPLICADO",
    });
    expect(
      await guardarColaborador(
        db,
        otra.empresa.id,
        colaborador({ usuarioProdigal: `U${empresa.numero}` }),
        otra.actor,
        HOY,
      ),
    ).toMatchObject({ error: "PRODIGAL_DUPLICADO" });
    const [oficinaAjena] = await db
      .insert(t.canales)
      .values({ empresaId: otra.empresa.id, codigo: "01", nombre: "Central" })
      .returning();
    expect(
      await guardarColaborador(
        db,
        empresa.id,
        colaborador({ alcance: `canal:${oficinaAjena!.id}` }),
        actor,
        HOY,
      ),
    ).toMatchObject({ error: "ALCANCE_INVALIDO" });
  });

  it("registra el cambio en la auditoría", async () => {
    const { empresa, actor } = await preparar();
    const r = await guardarColaborador(
      db,
      empresa.id,
      colaborador({ nombre: "Auditado" }),
      actor,
      HOY,
    );
    if (!r.ok) throw new Error();
    const { registros } = await listarAuditoria(db, { entidad: "colaborador", texto: r.id });
    expect(registros[0]).toMatchObject({ accion: "alta", entidadId: r.id });
  });

  it("al ingresar, el usuario queda vinculado a los colaboradores con su mail", async () => {
    const { admin } = await preparar();
    const id = `usuario-${admin.id}`;
    await db
      .insert(t.usuarios)
      .values({ id, name: "Admin", email: admin.email, emailVerified: true });
    await vincularColaboradores(db, id, admin.email.toUpperCase());
    const [fila] = await db.select().from(t.colaboradores).where(eq(t.colaboradores.id, admin.id));
    expect(fila?.usuarioId).toBe(id);
  });
});

describe("aseguradoras e interfaces", () => {
  const aseguradora = async (abreviatura: string) =>
    (await db.query.aseguradoras.findFirst({
      where: eq(t.aseguradoras.abreviatura, abreviatura),
    }))!;

  it("activa interfaces hasta lo licenciado y programa la baja para el mes siguiente", async () => {
    const { empresa, actor } = await preparar(); // 3 interfaces de Prodigal
    const abreviaturas = ["SEGUNDA", "SANCOR", "FEDPAT", "MERCANT"];
    for (const a of abreviaturas) {
      const { id } = await aseguradora(a);
      expect(
        (
          await cambiarAseguradora(
            db,
            empresa.id,
            { aseguradoraId: id, cambio: "trabaja", valor: true },
            actor.usuarioId,
            HOY,
          )
        ).ok,
      ).toBe(true);
    }
    const ids = await Promise.all(abreviaturas.map(async (a) => (await aseguradora(a)).id));
    for (const id of ids.slice(0, 3)) {
      expect(
        await cambiarAseguradora(
          db,
          empresa.id,
          { aseguradoraId: id, cambio: "prodigal", valor: true },
          actor.usuarioId,
          HOY,
        ),
      ).toEqual({ ok: true });
    }
    expect(
      await cambiarAseguradora(
        db,
        empresa.id,
        { aseguradoraId: ids[3]!, cambio: "prodigal", valor: true },
        actor.usuarioId,
        HOY,
      ),
    ).toMatchObject({ ok: false, error: "LIMITE_ALCANZADO" });

    // Baja: rige el 1/10; hasta entonces sigue contando.
    expect(
      await cambiarAseguradora(
        db,
        empresa.id,
        { aseguradoraId: ids[0]!, cambio: "prodigal", valor: false },
        actor.usuarioId,
        HOY,
      ),
    ).toEqual({ ok: true, bajaDesde: "2026-10-01" });
    expect((await usoDeLimites(db, empresa.id, HOY)).interfaces.prodigal.enUso).toBe(3);
    expect(
      (await usoDeLimites(db, empresa.id, fecha("2026-10-01"))).interfaces.prodigal.enUso,
    ).toBe(2);

    // Cancelar la baja antes de que rija.
    await cambiarAseguradora(
      db,
      empresa.id,
      { aseguradoraId: ids[0]!, cambio: "prodigal", valor: true },
      actor.usuarioId,
      HOY,
    );
    const lista = await listarAseguradorasEmpresa(db, empresa.id, HOY);
    expect(lista.find((a) => a.id === ids[0])?.interfaces.prodigal).toMatchObject({
      vigente: true,
      bajaDesde: null,
    });
  });

  it("rechaza interfaces no disponibles o de aseguradoras con las que no trabaja", async () => {
    const { empresa, actor } = await preparar();
    const zurich = await aseguradora("ZURICH"); // sin interfaz de Prodigal
    expect(
      await cambiarAseguradora(
        db,
        empresa.id,
        { aseguradoraId: zurich.id, cambio: "prodigal", valor: true },
        actor.usuarioId,
        HOY,
      ),
    ).toMatchObject({ error: "NO_TRABAJA" });
    await cambiarAseguradora(
      db,
      empresa.id,
      { aseguradoraId: zurich.id, cambio: "trabaja", valor: true },
      actor.usuarioId,
      HOY,
    );
    expect(
      await cambiarAseguradora(
        db,
        empresa.id,
        { aseguradoraId: zurich.id, cambio: "prodigal", valor: true },
        actor.usuarioId,
        HOY,
      ),
    ).toMatchObject({ error: "NO_DISPONIBLE" });
    // CotiWeb no está licenciado en este paquete.
    expect(
      await cambiarAseguradora(
        db,
        empresa.id,
        { aseguradoraId: zurich.id, cambio: "cotiweb", valor: true },
        actor.usuarioId,
        HOY,
      ),
    ).toMatchObject({ error: "SIN_LICENCIA" });
  });

  it("dejar de trabajar con una aseguradora programa la baja de sus interfaces", async () => {
    const { empresa, actor } = await preparar();
    const { id } = await aseguradora("ALLIANZ");
    await cambiarAseguradora(
      db,
      empresa.id,
      { aseguradoraId: id, cambio: "trabaja", valor: true },
      actor.usuarioId,
      HOY,
    );
    await cambiarAseguradora(
      db,
      empresa.id,
      { aseguradoraId: id, cambio: "prodigal", valor: true },
      actor.usuarioId,
      HOY,
    );
    await cambiarAseguradora(
      db,
      empresa.id,
      { aseguradoraId: id, cambio: "trabaja", valor: false },
      actor.usuarioId,
      HOY,
    );
    const fila = await db.query.empresaAseguradoras.findFirst({
      where: and(
        eq(t.empresaAseguradoras.empresaId, empresa.id),
        eq(t.empresaAseguradoras.aseguradoraId, id),
      ),
    });
    expect(fila).toMatchObject({ activa: false, interfazProdigalBajaDesde: "2026-10-01" });
  });
});

describe("productores", () => {
  const base = {
    nombre: "Gómez Seguros",
    esProductor: true,
    esOrganizador: false,
    esSubproductor: false,
    agenteInstitorio: false,
  };

  it("el agente institorio necesita la función en la licencia", async () => {
    const inicial = await preparar("PRO-INICIAL");
    expect(
      await guardarProductor(
        db,
        inicial.empresa.id,
        { ...base, agenteInstitorio: true },
        "actor",
        HOY,
      ),
    ).toEqual({ ok: false, error: "SIN_INSTITORIO" });
    const full = await preparar("PRO-FULL");
    expect(
      (
        await guardarProductor(
          db,
          full.empresa.id,
          { ...base, agenteInstitorio: true },
          "actor",
          HOY,
        )
      ).ok,
    ).toBe(true);
  });

  it("no repite CUIT dentro de la empresa", async () => {
    const { empresa } = await preparar();
    await guardarProductor(db, empresa.id, { ...base, cuit: "20123456786" }, "actor", HOY);
    expect(
      await guardarProductor(
        db,
        empresa.id,
        { ...base, nombre: "Otro", cuit: "20123456786" },
        "actor",
        HOY,
      ),
    ).toEqual({ ok: false, error: "CUIT_DUPLICADO" });
  });

  it("códigos: aseguradora con la que trabaja, rol del productor y sin duplicados", async () => {
    const { empresa, actor } = await preparar();
    const productor = await guardarProductor(db, empresa.id, base, "actor", HOY);
    if (!productor.ok) throw new Error();
    const sancor = (await db.query.aseguradoras.findFirst({
      where: eq(t.aseguradoras.abreviatura, "SANCOR"),
    }))!;
    const codigo = {
      productorId: productor.id,
      aseguradoraId: sancor.id,
      codigo: "A-123",
      rol: "PRODUCTOR" as const,
    };

    expect(await agregarCodigo(db, empresa.id, codigo, "actor")).toEqual({
      ok: false,
      error: "NO_TRABAJA",
    });
    await cambiarAseguradora(
      db,
      empresa.id,
      { aseguradoraId: sancor.id, cambio: "trabaja", valor: true },
      actor.usuarioId,
      HOY,
    );
    expect(await agregarCodigo(db, empresa.id, { ...codigo, rol: "ORGANIZADOR" }, "actor")).toEqual(
      {
        ok: false,
        error: "ROL_INVALIDO",
      },
    );
    expect(await agregarCodigo(db, empresa.id, codigo, "actor")).toEqual({ ok: true });
    expect(await agregarCodigo(db, empresa.id, codigo, "actor")).toEqual({
      ok: false,
      error: "DUPLICADO",
    });
    // El listado cuenta los códigos de cada productor (no los de otro).
    await guardarProductor(db, empresa.id, { ...base, nombre: "Sin códigos" }, "actor", HOY);
    const lista = await listarProductores(db, empresa.id);
    expect(lista.find((p) => p.id === productor.id)?.codigos).toBe(1);
    expect(lista.find((p) => p.nombre === "Sin códigos")?.codigos).toBe(0);

    const [fila] = await db
      .select()
      .from(t.productorCodigos)
      .where(eq(t.productorCodigos.productorId, productor.id));
    expect(await quitarCodigo(db, empresa.id, fila!.id, "actor")).toBe(true);
    // Se puede volver a cargar el mismo código.
    expect(await agregarCodigo(db, empresa.id, codigo, "actor")).toEqual({ ok: true });
    // Una empresa no toca códigos de otra.
    const otra = await preparar();
    expect(await quitarCodigo(db, otra.empresa.id, fila!.id, "actor")).toBe(false);
  });
});

describe("políticas", () => {
  it("guarda y lee las políticas de la empresa", async () => {
    const { empresa } = await preparar();
    const politicas = {
      oficinasNotifican: false,
      oficinasUsanPozoEmpresa: true,
      topeMensualPozoPorOficina: null,
      oficinasContratan: false,
    };
    await guardarPoliticas(db, empresa.id, politicas, "actor");
    expect(await leerPoliticas(db, empresa.id)).toEqual(politicas);
  });
});

describe("usuarios de SOFTeam", () => {
  it("invita, cambia el rol y quita el acceso con sus resguardos", async () => {
    const admin = await db.query.usuarios.findFirst({
      where: eq(t.usuarios.rolSofteam, "ADMINISTRACION"),
    });
    const invitado = await invitarUsuarioSofteam(
      db,
      { nombre: "Carla Comercial", email: "carla@softeam.com.ar", rol: "COMERCIAL" },
      admin!.id,
    );
    expect(invitado).toMatchObject({
      ok: true,
      usuario: { verificado: false, rolSofteam: "COMERCIAL" },
    });
    expect(
      await invitarUsuarioSofteam(
        db,
        { nombre: "Carla", email: "CARLA@softeam.com.ar", rol: "SOPORTE" },
        admin!.id,
      ),
    ).toEqual({ ok: false, error: "YA_EXISTE" });

    if (!invitado.ok) throw new Error();
    await db.insert(t.sesiones).values({
      id: "s1",
      token: "token-s1",
      userId: invitado.usuario.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await cambiarRolSofteam(db, invitado.usuario.id, "SOPORTE", admin!.id)).toEqual({
      ok: true,
    });
    expect(await cambiarRolSofteam(db, invitado.usuario.id, null, admin!.id)).toEqual({ ok: true });
    expect(await db.$count(t.sesiones, eq(t.sesiones.userId, invitado.usuario.id))).toBe(0);

    // Último ingreso: el de cada usuario.
    await db.insert(t.sesiones).values({
      id: "s-admin",
      token: "token-admin",
      userId: admin!.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const lista = await listarUsuariosSofteam(db);
    expect(lista.find((u) => u.id === admin!.id)?.ultimoIngreso).toBeInstanceOf(Date);

    expect(await cambiarRolSofteam(db, admin!.id, "SOPORTE", admin!.id)).toEqual({
      ok: false,
      error: "PROPIO",
    });
    expect(await cambiarRolSofteam(db, admin!.id, "SOPORTE", "otro-admin")).toEqual({
      ok: false,
      error: "ULTIMO_ADMIN",
    });
  });

  it("un usuario de un cliente no puede ser de SOFTeam", async () => {
    const { empresa, actor } = await preparar();
    const email = `cliente.${empresa.numero}@test.com`;
    await guardarColaborador(
      db,
      empresa.id,
      colaborador({ email, adminOperativo: true }),
      actor,
      HOY,
    );
    expect(
      await invitarUsuarioSofteam(db, { nombre: "X", email, rol: "SOPORTE" }, "actor"),
    ).toEqual({ ok: false, error: "ES_CLIENTE" });
  });
});
