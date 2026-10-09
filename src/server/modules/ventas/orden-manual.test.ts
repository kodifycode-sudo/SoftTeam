import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { crearTicket, esquemaTicket } from "../catalogo/tickets";
import { agregarAlCarrito } from "./carrito";
import { cotizarCarrito } from "./checkout";
import {
  confirmarOrdenManual,
  cotizarOrdenManual,
  type EntradaOrdenManual,
  esquemaItemManual,
  renovablesOrdenManual,
} from "./orden-manual";

const HOY = fecha("2026-10-20");
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

const item = (alternativaId: string, parcial: Record<string, unknown> = {}) =>
  esquemaItemManual.parse({
    alternativaId,
    cantidad: 1,
    bonificacion: "0",
    recurrente: false,
    ...parcial,
  });

const confirmar = (entrada: EntradaOrdenManual) =>
  confirmarOrdenManual(db, { ...entrada, usuarioId, claveIdempotencia: crypto.randomUUID() }, HOY);

describe("orden manual de SOFTeam (Mejora v2.1, 8.17 y 11.8)", () => {
  it("consumible bonificado al 100 % con su saldo: pagado en el acto y sin renovación", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const noti = await alternativa("NOTI-10K", "Pago único");
    expect(esquemaItemManual.safeParse({ ...item(noti), bonificacion: "100" }).success).toBe(false);
    expect(
      await confirmar({
        empresaId: empresa.id,
        items: [item(noti, { cantidadSaldo: 500 })],
      }),
    ).toMatchObject({ ok: false, error: "SALDO_SOLO_BONIFICADO" });

    const r = await confirmar({
      empresaId: empresa.id,
      items: [
        item(noti, {
          bonificacion: "100",
          recurrente: true,
          motivo: "Reclamo por mensajes no enviados",
          cantidadSaldo: 2500,
        }),
      ],
    });
    if (!r.ok) throw new Error(r.error);
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, r.valor.ordenId!) });
    expect(orden).toMatchObject({ estado: "PAGADA", total: 0n, tipoGeneracion: "MANUAL" });
    const contrato = await db.query.contratos.findFirst({
      where: eq(t.contratos.ordenId, r.valor.ordenId!),
    });
    expect(contrato).toMatchObject({
      estado: "ACTIVO",
      noRenovar: true,
      bonifRecurrente: false,
      bonifMotivo: "Reclamo por mensajes no enviados",
    });
    const saldo = await db.query.contratoRecursos.findFirst({
      where: and(
        eq(t.contratoRecursos.contratoId, contrato!.id),
        eq(t.contratoRecursos.recursoId, "notificaciones.saldo"),
      ),
    });
    expect(saldo).toMatchObject({ cantidad: 2500, saldo: 2500 });
  });

  it("vende paquetes privados y aplica tickets que el cliente no puede usar", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    await db.delete(t.ordenes).where(eq(t.ordenes.empresaId, empresa.id));
    await db.update(t.paquetes).set({ privado: true }).where(eq(t.paquetes.codigo, "CW-PRO"));
    const trimestral = await alternativa("CW-PRO", "Trimestral inicial");
    const ticket = await crearTicket(
      db,
      esquemaTicket.parse({
        codigo: "SOLO-SOFTEAM",
        porcentaje: "10",
        tope: "0",
        minimo: "0",
        uso: "UNICO_X_CLIENTE",
        usosMaximos: 0,
        vigenteDesde: "2026-01-01",
        vigenteHasta: "2026-12-31",
        paquetes: [],
        altaInicial: true,
        adicional: true,
        renovacion: true,
        publico: false,
      }),
      usuarioId,
    );
    expect(ticket.ok).toBe(true);

    // El cliente no lo ve ni lo puede comprar.
    await agregarAlCarrito(
      db,
      { empresaId: empresa.id, alternativaId: trimestral, cantidad: 1, usuarioId },
      HOY,
    );
    expect(await cotizarCarrito(db, empresa.id, {}, HOY)).toMatchObject({ ok: false });

    const cotizada = await cotizarOrdenManual(
      db,
      { empresaId: empresa.id, items: [item(trimestral)], ticketCodigo: "SOLO-SOFTEAM" },
      HOY,
    );
    await db.update(t.paquetes).set({ privado: false }).where(eq(t.paquetes.codigo, "CW-PRO"));
    if (!cotizada.ok) throw new Error(cotizada.error);
    // Trimestre de $195.000 − 10 % (sin tope).
    expect(cotizada.valor.calculo.ticketDescuento).toBe(centavos("19500"));
    expect(cotizada.valor.situacion).toBe("TRIMESTRE_INICIAL");
  });

  it("negocia la primera renovación del trimestre: elige período y día, con el tramo", async () => {
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
    const renovables = await renovablesOrdenManual(db, empresa.id);
    const renovable = renovables.find((r) => r.id === trimestre.id);
    expect(renovable).toMatchObject({ trimestreInicial: true });
    expect(renovable?.alternativas.map((a) => a.nombre)).toEqual(["Mensual", "Anual"]);

    const mensual = renovable!.alternativas.find((a) => a.nombre === "Mensual")!.id;
    const r = await confirmar({
      empresaId: empresa.id,
      items: [item(mensual, { contratoAnteriorId: trimestre.id })],
      diaVenc: 10,
    });
    if (!r.ok) throw new Error(r.error);
    const nuevo = await db.query.contratos.findFirst({
      where: eq(t.contratos.contratoAnteriorId, trimestre.id),
    });
    // Del 1/11 al 10/11 (10 días) más el mes hasta el 10/12.
    expect(nuevo).toMatchObject({
      tipoAccion: "RENOVACION",
      desde: "2026-11-01",
      hasta: "2026-12-10",
      diaVenc: 10,
      prorrataDias: 10,
    });
    // El trimestre ya tiene su renovación; ahora se renueva el contrato nuevo.
    expect((await renovablesOrdenManual(db, empresa.id)).map((c) => c.id)).toEqual([nuevo!.id]);
  });

  it("factura con el emisor que elige Administración", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const [otro] = await db
      .insert(t.emisores)
      .values({
        razonSocial: "Otra sociedad SA",
        cuit: "30712345671",
        condicionIva: "RESPONSABLE_INSCRIPTO",
        domicilioFiscal: "Calle 1",
        paisId: "AR",
        mercadoPago: true,
      })
      .returning();
    const r = await confirmar({
      empresaId: empresa.id,
      items: [item(await alternativa("NOTI-10K", "Pago único"))],
      emisorId: otro!.id,
    });
    if (!r.ok) throw new Error(r.error);
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, r.valor.ordenId!) });
    expect(orden).toMatchObject({ emisorId: otro!.id, emisorRazonSocial: "Otra sociedad SA" });
  });
});
