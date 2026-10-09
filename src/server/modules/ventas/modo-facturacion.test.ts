import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha, sumarDias } from "@/domain/fecha";
import { ventanasDeRenovacion } from "@/domain/procesos/calendario";
import { crearFacturadorSimulado } from "@/server/cobros/facturador";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { facturarPendientes } from "../cobros/facturacion";
import { licenciaDeEmpresa } from "../licencias/licencia-empresa";
import { guardarPlazosContrato } from "../licencias/plazos-contrato";
import { procesoDiario } from "../procesos/diario";
import { procesoRenovacion } from "../procesos/renovacion";
import { agregarAlCarrito } from "./carrito";
import { confirmarOrden, cotizarCarrito, mediosParaEmpresa } from "./checkout";
import { registrarPago } from "./ordenes";

const HOY = fecha("2026-09-25");
let db: Db;
let usuarioId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  usuarioId = (await db.query.usuarios.findFirst())!.id;
  // Medios por modo con los valores iniciales sugeridos.
  for (const [codigo, modos] of [
    ["LINK_MP", [0, 2]],
    ["TRANSF", [1]],
    ["SUSC_MP", [2]],
    ["PLAN_FP", [3]],
    ["PLAN_VIC", [3]],
  ] as const) {
    await db
      .update(t.mediosPago)
      .set({ modosFacturacion: [...modos] })
      .where(eq(t.mediosPago.codigo, codigo));
  }
  // La planilla no está habilitada para el alta inicial: las altas del
  // modo 3 se resuelven como altas a grupo. Acá se habilita
  // para probar el modo con una orden.
  await db
    .update(t.mediosPago)
    .set({ habilitadoAlta: true })
    .where(eq(t.mediosPago.codigo, "PLAN_FP"));
});

const medio = async (codigo: string) =>
  (await db.query.mediosPago.findFirst({ where: eq(t.mediosPago.codigo, codigo) }))!;

async function carritoDe(modoFacturacion: 0 | 1 | 2 | 3) {
  const { empresa, cliente } = await crearEmpresaDePrueba(db, { modoFacturacion });
  await db.delete(t.ordenes).where(eq(t.ordenes.empresaId, empresa.id));
  const [alt] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(
      and(eq(t.paquetes.codigo, "PRO-INICIAL"), eq(t.alternativas.nombre, "Trimestral inicial")),
    );
  await agregarAlCarrito(
    db,
    { empresaId: empresa.id, alternativaId: alt!.id, cantidad: 1, usuarioId },
    HOY,
  );
  return { empresa, cliente };
}

const confirmar = (empresaId: string, medioPagoId?: string, ticketCodigo?: string) =>
  confirmarOrden(
    db,
    { empresaId, usuarioId, medioPagoId, ticketCodigo, claveIdempotencia: crypto.randomUUID() },
    HOY,
  );

describe("medios de pago por modo de facturación", () => {
  it("cada modo ofrece solo los medios habilitados para él", async () => {
    const directo = await carritoDe(0);
    const medios = await mediosParaEmpresa(db, directo.empresa.id);
    expect(medios.map((m) => m.codigo)).toEqual(["LINK_MP"]);
    expect(
      await cotizarCarrito(
        db,
        directo.empresa.id,
        { medioPagoId: (await medio("TRANSF")).id },
        HOY,
      ),
    ).toMatchObject({ ok: false, error: "MEDIO_NO_HABILITADO" });

    const adelantada = await carritoDe(1);
    expect((await mediosParaEmpresa(db, adelantada.empresa.id)).map((m) => m.codigo)).toEqual([
      "TRANSF",
    ]);
  });
});

describe("estado inicial y factura según el modo", () => {
  it("modo 0: espera el pago y se factura al cobrar", async () => {
    const { empresa } = await carritoDe(0);
    const r = await confirmar(empresa.id);
    if (!r.ok) throw new Error(r.error);
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, r.valor.ordenId) });
    expect(orden?.modoFacturacion).toBe(0);
    const [contrato] = await db
      .select()
      .from(t.contratos)
      .where(eq(t.contratos.ordenId, orden!.id));
    expect(contrato).toMatchObject({ estado: "PEND_PAGO", pendPagoActivoHasta: null });

    await facturarPendientes(db, crearFacturadorSimulado());
    expect(
      (await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, orden!.id) }))?.facturadaEn,
    ).toBeNull();
  });

  it("modo 1: nace habilitado con tolerancia y se factura al confirmar, antes del pago", async () => {
    const { empresa } = await carritoDe(1);
    const r = await confirmar(empresa.id);
    if (!r.ok) throw new Error(r.error);
    const [contrato] = await db
      .select()
      .from(t.contratos)
      .where(eq(t.contratos.ordenId, r.valor.ordenId));
    expect(contrato).toMatchObject({
      estado: "PEND_PAGO_ACTIVO",
      desde: HOY,
      pendPagoActivoHasta: sumarDias(HOY, 30),
    });

    await facturarPendientes(db, crearFacturadorSimulado());
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, r.valor.ordenId) });
    expect(orden).toMatchObject({ estado: "PEND_PAGO" });
    expect(orden?.facturaNumero).toBeTruthy();
  });

  it("modo 3: habilitado sin límite y sin tickets", async () => {
    const { empresa } = await carritoDe(3);
    await db.insert(t.tickets).values({
      codigo: "MODO3",
      porcentaje: porcentaje("10"),
      tope: centavos("1000"),
      vigenteDesde: fecha("2026-01-01"),
      vigenteHasta: fecha("2026-12-31"),
    });
    const planilla = (await medio("PLAN_FP")).id;
    expect(await confirmar(empresa.id, planilla, "MODO3")).toMatchObject({
      ok: false,
      error: "TICKET_CORPORATIVO",
    });
    const r = await confirmar(empresa.id, planilla);
    if (!r.ok) throw new Error(r.error);
    const [contrato] = await db
      .select()
      .from(t.contratos)
      .where(eq(t.contratos.ordenId, r.valor.ordenId));
    expect(contrato).toMatchObject({ estado: "PEND_PAGO_ACTIVO", pendPagoActivoHasta: null });
  });
});

describe("prórroga de la renovación", () => {
  // El 11/10 se generan los vencimientos del 13/10 al 2/11.
  const ventana = ventanasDeRenovacion(fecha("2026-10-11")).at(-1)!;

  async function contratoQueVence(modoFacturacion: 0 | 1 | 2 | 3) {
    const { empresa, orden } = await crearEmpresaDePrueba(db, { modoFacturacion });
    const medioDelModo = modoFacturacion === 1 ? "TRANSF" : "LINK_MP";
    await db
      .update(t.clientes)
      .set({ medioPagoRenovacionId: (await medio(medioDelModo)).id })
      .where(eq(t.clientes.id, empresa.clienteId));
    const contrato = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "PRO-INICIAL",
        estado: "ACTIVO",
        desde: fecha("2026-10-01"),
        hasta: fecha("2026-10-31"),
      },
    );
    await procesoRenovacion(db, ventana);
    const nuevo = await db.query.contratos.findFirst({
      where: eq(t.contratos.contratoAnteriorId, contrato.id),
    });
    return { empresa, contrato, nuevo: nuevo! };
  }

  const sumaUsuarios = async (empresaId: string, dia: string) =>
    (await licenciaDeEmpresa(db, empresaId, fecha(dia))).contratosVigentes.length;

  it("modo 0: el anterior sigue sumando la tolerancia y deja de estar prorrogado al pagar", async () => {
    const { empresa, contrato, nuevo } = await contratoQueVence(0);
    expect(nuevo.estado).toBe("PEND_PAGO");
    const anterior = await db.query.contratos.findFirst({ where: eq(t.contratos.id, contrato.id) });
    expect(anterior?.prorrogaHasta).toBe("2026-11-07");
    expect(await sumaUsuarios(empresa.id, "2026-11-07")).toBe(1);
    expect(await sumaUsuarios(empresa.id, "2026-11-08")).toBe(0);

    await registrarPago(db, nuevo.ordenId!, "actor", fecha("2026-11-03"));
    const despues = await db.query.contratos.findFirst({ where: eq(t.contratos.id, contrato.id) });
    expect(despues?.prorrogaHasta).toBeNull();
    // Rige solo el contrato nuevo: la licencia no se duplica.
    expect(await sumaUsuarios(empresa.id, "2026-11-05")).toBe(1);
  });

  it("modo 1: el nuevo nace habilitado hasta su inicio + tolerancia", async () => {
    const { contrato, nuevo } = await contratoQueVence(1);
    expect(nuevo).toMatchObject({
      estado: "PEND_PAGO_ACTIVO",
      desde: "2026-11-01",
      pendPagoActivoHasta: "2026-12-01",
    });
    const anterior = await db.query.contratos.findFirst({ where: eq(t.contratos.id, contrato.id) });
    expect(anterior?.prorrogaHasta).toBeNull();
  });

  it("Administración ajusta la prórroga, con motivo, y no antes del vencimiento", async () => {
    const { empresa, contrato } = await contratoQueVence(0);
    expect(
      await guardarPlazosContrato(
        db,
        { contratoId: contrato.id, prorrogaHasta: fecha("2026-10-15"), motivo: "Error de carga" },
        usuarioId,
      ),
    ).toEqual({ ok: false, error: "PRORROGA_ANTERIOR" });
    expect(
      await guardarPlazosContrato(
        db,
        { contratoId: contrato.id, prorrogaHasta: fecha("2026-11-20"), motivo: "Pidió más tiempo" },
        usuarioId,
      ),
    ).toEqual({ ok: true, empresaId: empresa.id });
    expect(await sumaUsuarios(empresa.id, "2026-11-20")).toBe(1);
    const auditoria = await db.query.auditoria.findFirst({
      where: and(eq(t.auditoria.entidadId, contrato.id), eq(t.auditoria.accion, "plazos")),
    });
    expect(auditoria?.motivo).toBe("Pidió más tiempo");
  });

  it("un contrato prorrogado no genera el aviso de licencia vencida", async () => {
    const { empresa } = await contratoQueVence(0);
    await procesoDiario(db, fecha("2026-11-03"));
    const vencida = await db.query.alertas.findFirst({
      where: and(eq(t.alertas.empresaId, empresa.id), eq(t.alertas.tipo, "LICENCIA_VENCIDA")),
    });
    expect(vencida).toBeUndefined();
  });
});

describe("factura agrupada impaga", () => {
  it("pasada la tolerancia del modo 3 avisa a SOFTeam, sin suspender", async () => {
    const { empresa } = await carritoDe(3);
    const r = await confirmar(empresa.id, (await medio("PLAN_FP")).id);
    if (!r.ok) throw new Error(r.error);
    await db
      .update(t.ordenes)
      .set({ creadoEn: new Date("2026-06-01T12:00:00Z") })
      .where(eq(t.ordenes.id, r.valor.ordenId));
    await procesoDiario(db, HOY);
    const alerta = await db.query.alertas.findFirst({
      where: and(
        eq(t.alertas.ordenId, r.valor.ordenId),
        eq(t.alertas.tipo, "TOLERANCIA_PAGO_VENCIDA"),
      ),
    });
    expect(alerta).toMatchObject({ paraSofteam: true, paraCliente: false });
  });
});
