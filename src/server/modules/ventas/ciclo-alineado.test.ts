import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { ventanasDeRenovacion } from "@/domain/procesos/calendario";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { procesoDiario } from "../procesos/diario";
import { procesoRenovacion } from "../procesos/renovacion";
import { agregarAlCarrito, cambiarCantidad, listarCarrito, renovablesDeEmpresa } from "./carrito";
import { confirmarAltaAGrupo, confirmarOrden, cotizarCarrito } from "./checkout";
import {
  altasAGrupoPendientes,
  anularAltaAGrupo,
  cajasTablero,
  renovacionesANegociar,
} from "./tablero";

const HOY = fecha("2026-09-25");
let db: Db;
let usuarioId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  usuarioId = (await db.query.usuarios.findFirst())!.id;
});

async function alternativa(codigo: string, nombre: string) {
  const [fila] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(and(eq(t.paquetes.codigo, codigo), eq(t.alternativas.nombre, nombre)));
  return fila!.id;
}

const agregar = async (empresaId: string, codigo: string, nombre: string) =>
  agregarAlCarrito(
    db,
    { empresaId, alternativaId: await alternativa(codigo, nombre), cantidad: 1, usuarioId },
    HOY,
  );

/** Empresa con un paquete vigente que vence el 10/10, alineado al día 10. */
async function empresaAlineada(modoFacturacion: 0 | 1 | 2 | 3 = 0) {
  const { empresa, cliente, orden } = await crearEmpresaDePrueba(db, { modoFacturacion });
  const contrato = await crearContratoDePrueba(
    db,
    { empresaId: empresa.id, ordenId: orden.id },
    {
      codigoPaquete: "PRO-INICIAL",
      estado: "ACTIVO",
      desde: fecha("2026-09-11"),
      hasta: fecha("2026-10-10"),
    },
  );
  return { empresa, cliente, contrato };
}

describe("ciclo mensual alineado", () => {
  it("adicional: cobra el tramo hasta el vencimiento del cliente y no acepta el trimestral", async () => {
    const { empresa } = await empresaAlineada();
    await agregar(empresa.id, "CW-PRO", "Trimestral inicial");
    expect(await cotizarCarrito(db, empresa.id, {}, HOY)).toMatchObject({
      ok: false,
      error: "PLAN_NO_PERMITIDO",
    });
    const [trimestral] = await listarCarrito(db, empresa.id);
    await cambiarCantidad(db, { empresaId: empresa.id, itemId: trimestral!.id, cantidad: 0 });

    await agregar(empresa.id, "CW-PRO", "Mensual");
    const r = await cotizarCarrito(db, empresa.id, {}, HOY);
    if (!r.ok) throw new Error(r.error);
    // Del 25/9 al 10/10: 16 días de un mensual de $65.000 = 65.000 × 16 / 30.
    expect(r.valor).toMatchObject({ situacion: "ADICIONAL", diaVenc: 10, diasVenc: [10, 20] });
    expect(r.valor.lineas[0]?.periodo).toMatchObject({
      prorrataDias: 16,
      incluyePeriodo: false,
      hasta: "2026-10-10",
    });
    expect(r.valor.calculo.subtotal).toBe(centavos("34666.67"));

    // Otro día: no hay paquetes al 20, el tramo llega al próximo 20.
    const al20 = await cotizarCarrito(db, empresa.id, { diaVenc: 20 }, HOY);
    if (!al20.ok) throw new Error(al20.error);
    expect(al20.valor.lineas[0]?.periodo).toMatchObject({ prorrataDias: 26, hasta: "2026-10-20" });
    expect(await cotizarCarrito(db, empresa.id, { diaVenc: 15 }, HOY)).toMatchObject({
      ok: false,
      error: "DIA_INVALIDO",
    });

    const confirmada = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!confirmada.ok) throw new Error(confirmada.error);
    const contrato = await db.query.contratos.findFirst({
      where: eq(t.contratos.ordenId, confirmada.valor.ordenId),
    });
    expect(contrato).toMatchObject({
      desde: "2026-09-25",
      hasta: "2026-10-10",
      diaVenc: 10,
      prorrataHasta: "2026-10-10",
      prorrataDias: 16,
      prorrataImporte: centavos("34666.67"),
    });
    const [item] = await db.query.ordenItems.findMany({
      where: eq(t.ordenItems.ordenId, confirmada.valor.ordenId),
    });
    expect(item?.descripcion).toContain("16 días hasta el");
  });

  it("el trimestre inicial no se renueva solo ni desde el portal: se negocia", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db, { modoFacturacion: 1 });
    const trimestre = await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "PRO-INICIAL",
        estado: "ACTIVO",
        desde: fecha("2026-08-01"),
        hasta: fecha("2026-10-31"),
        diaVenc: null,
      },
    );
    await procesoRenovacion(db, ventanasDeRenovacion(fecha("2026-10-11")).at(-1)!);
    expect(await db.$count(t.contratos, eq(t.contratos.contratoAnteriorId, trimestre.id))).toBe(0);
    expect(await renovablesDeEmpresa(db, empresa.id, null, HOY)).toEqual([]);

    // Aparece en el tablero desde el mes de su vencimiento, con semáforo.
    expect(
      (await renovacionesANegociar(db, fecha("2026-09-30"))).map((n) => n.contratoId),
    ).not.toContain(trimestre.id);
    const enOctubre = await renovacionesANegociar(db, fecha("2026-10-26"));
    expect(enOctubre.find((n) => n.contratoId === trimestre.id)?.semaforo).toBe("AMARILLO");
    expect(
      (await renovacionesANegociar(db, fecha("2026-11-02"))).find(
        (n) => n.contratoId === trimestre.id,
      )?.semaforo,
    ).toBe("ROJO");
    expect((await cajasTablero(db, fecha("2026-10-26"))).negociar.total).toBeGreaterThan(0);

    // El proceso diario avisa a SOFTeam una sola vez.
    await procesoDiario(db, fecha("2026-10-01"));
    await procesoDiario(db, fecha("2026-10-02"));
    const avisos = await db.query.alertas.findMany({
      where: and(
        eq(t.alertas.tipo, "RENOVACION_A_NEGOCIAR"),
        eq(t.alertas.contratoId, trimestre.id),
      ),
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ paraCliente: false, paraSofteam: true });
  });

  it("alta a grupo: sin orden hasta la colectiva, que cobra el tramo y el primer período", async () => {
    const planilla = (await db.query.mediosPago.findFirst({
      where: eq(t.mediosPago.codigo, "PLAN_FP"),
    }))!;
    const a = await empresaAlineada(3);
    const b = await empresaAlineada(3);
    const [grupo] = await db
      .insert(t.gruposEconomicos)
      .values({
        nombre: `Grupo ${a.empresa.numero}`,
        nombreCorto: `G${a.empresa.numero}`,
        clienteFacturacionId: a.cliente.id,
      })
      .returning();
    for (const e of [a, b]) {
      await db
        .update(t.clientes)
        .set({
          grupoId: grupo!.id,
          medioPagoAltaId: planilla.id,
          medioPagoRenovacionId: planilla.id,
        })
        .where(eq(t.clientes.id, e.cliente.id));
    }

    await agregar(b.empresa.id, "CW-PRO", "Mensual");
    const cotizada = await cotizarCarrito(db, b.empresa.id, { medioPagoId: planilla.id }, HOY);
    if (!cotizada.ok) throw new Error(cotizada.error);
    // Día fijo del grupo, sin selector; el tramo llega al vencimiento del grupo.
    expect(cotizada.valor).toMatchObject({ situacion: "GRUPO", diaVenc: 10, diasVenc: [] });
    const entrada = { empresaId: b.empresa.id, usuarioId, medioPagoId: planilla.id };
    expect(
      await confirmarOrden(db, { ...entrada, claveIdempotencia: crypto.randomUUID() }, HOY),
    ).toMatchObject({ ok: false, error: "ALTA_A_GRUPO" });
    expect(await confirmarAltaAGrupo(db, entrada, HOY)).toEqual({
      ok: true,
      valor: { contratos: 1 },
    });
    const alta = await db.query.contratos.findFirst({
      where: and(
        eq(t.contratos.empresaId, b.empresa.id),
        eq(t.contratos.tipoAccion, "ALTA"),
        eq(t.contratos.prorrataDias, 16),
      ),
    });
    expect(alta).toMatchObject({
      ordenId: null,
      estado: "PEND_PAGO_ACTIVO",
      desde: "2026-09-25",
      hasta: "2026-10-10",
      diaVenc: 10,
    });

    // La colectiva del 2/10 cobra en una orden las renovaciones, el tramo del
    // alta y su primer período completo.
    const resumen = await procesoRenovacion(db, ventanasDeRenovacion(fecha("2026-10-02")).at(-1)!);
    expect(resumen.errores).toEqual([]);
    const incorporada = await db.query.contratos.findFirst({ where: eq(t.contratos.id, alta!.id) });
    expect(incorporada?.ordenId).not.toBeNull();
    const renovacionAlta = await db.query.contratos.findFirst({
      where: eq(t.contratos.contratoAnteriorId, alta!.id),
    });
    expect(renovacionAlta).toMatchObject({
      ordenId: incorporada?.ordenId,
      desde: "2026-10-11",
      hasta: "2026-11-10",
    });
    const orden = await db.query.ordenes.findFirst({
      where: eq(t.ordenes.id, incorporada!.ordenId!),
    });
    expect(orden).toMatchObject({ agrupada: true, clienteFacturacionId: a.cliente.id });
    const items = await db.query.ordenItems.findMany({
      where: eq(t.ordenItems.ordenId, orden!.id),
    });
    expect(items).toHaveLength(4);
    expect(items.find((i) => i.contratoId === alta!.id)?.precioLista).toBe(centavos("34666.67"));

    // Otra alta, anulada antes de la colectiva: no se cobra.
    await agregar(b.empresa.id, "BS-BASE", "Mensual");
    await confirmarAltaAGrupo(db, entrada, HOY);
    const pendiente = (await altasAGrupoPendientes(db)).find((p) => p.empresa.id === b.empresa.id);
    expect(pendiente?.paquete).toBe("BienSeguro Base");
    expect(await anularAltaAGrupo(db, pendiente!.contratoId, usuarioId)).toEqual({ ok: true });
    expect(await anularAltaAGrupo(db, pendiente!.contratoId, usuarioId)).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
    expect(await anularAltaAGrupo(db, alta!.id, usuarioId)).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
    expect((await altasAGrupoPendientes(db)).some((p) => p.empresa.id === b.empresa.id)).toBe(
      false,
    );
  });
});
