import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { bonificarContrato, type EntradaBonificacion } from "./bonificacion";
import { agregarAlCarrito } from "./carrito";
import { confirmarOrden } from "./checkout";
import { registrarPago } from "./ordenes";

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

/** Orden por transferencia (sin ajuste): Prodigal Inicial trimestral ×2 ($228.000) + Notificaciones ($30.000). */
async function ordenPendiente() {
  const { empresa } = await crearEmpresaDePrueba(db);
  await db.delete(t.ordenes).where(eq(t.ordenes.empresaId, empresa.id));
  await agregarAlCarrito(
    db,
    {
      empresaId: empresa.id,
      alternativaId: await alternativa("PRO-INICIAL", "Trimestral inicial"),
      cantidad: 2,
      usuarioId,
    },
    HOY,
  );
  await agregarAlCarrito(
    db,
    {
      empresaId: empresa.id,
      alternativaId: await alternativa("NOTI-10K", "Pago único"),
      cantidad: 1,
      usuarioId,
    },
    HOY,
  );
  const transferencia = await db.query.mediosPago.findFirst({
    where: eq(t.mediosPago.codigo, "TRANSF"),
  });
  const r = await confirmarOrden(
    db,
    {
      empresaId: empresa.id,
      usuarioId,
      medioPagoId: transferencia!.id,
      claveIdempotencia: crypto.randomUUID(),
    },
    HOY,
  );
  if (!r.ok) throw new Error(r.error);
  const contratos = await db.query.contratos.findMany({
    where: eq(t.contratos.ordenId, r.valor.ordenId),
  });
  const prodigal = contratos.find((c) => c.cantidad === 2)!;
  return { ordenId: r.valor.ordenId, prodigal };
}

const bonificacion = (
  contratoId: string,
  cambios: Partial<EntradaBonificacion> = {},
): EntradaBonificacion => ({
  contratoId,
  porcentaje: porcentaje("10"),
  recurrente: true,
  motivo: "Cliente de muchos años",
  ...cambios,
});

describe("bonificación de paquetes por SOFTeam", () => {
  it("recalcula la orden, sus líneas y el contrato, e invalida el link de pago", async () => {
    const { ordenId, prodigal } = await ordenPendiente();
    await db
      .update(t.ordenes)
      .set({ linkPagoUrl: "https://pago/viejo" })
      .where(eq(t.ordenes.id, ordenId));

    const r = await bonificarContrato(db, bonificacion(prodigal.id), "admin");
    // (228.000 − 10 % + 30.000) × 1,21 = 235.200 × 1,21 = 284.592
    expect(r).toEqual({ ok: true, total: centavos("284592") });

    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    expect(orden).toMatchObject({
      subtotalLista: centavos("258000"),
      bonificacionTotal: centavos("22800"),
      subtotal: centavos("235200"),
      total: centavos("284592"),
      linkPagoUrl: null,
    });
    const items = await db.query.ordenItems.findMany({ where: eq(t.ordenItems.ordenId, ordenId) });
    expect(items.reduce((s, i) => s + i.totalProrrateado, 0n)).toBe(centavos("284592"));
    const contrato = await db.query.contratos.findFirst({ where: eq(t.contratos.id, prodigal.id) });
    expect(contrato).toMatchObject({
      bonifPorcentaje: porcentaje("10"),
      bonifRecurrente: true,
      bonifMotivo: "Cliente de muchos años",
      precioFinal: centavos("205200"),
    });

    // 0 % la quita.
    await bonificarContrato(db, bonificacion(prodigal.id, { porcentaje: 0n }), "admin");
    const sinBonif = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    expect(sinBonif?.total).toBe(centavos("312180"));
    expect(
      (await db.query.contratos.findFirst({ where: eq(t.contratos.id, prodigal.id) }))
        ?.bonifRecurrente,
    ).toBe(false);
  });

  it("solo con la orden pendiente y sin ticket", async () => {
    const pagada = await ordenPendiente();
    await registrarPago(db, pagada.ordenId, usuarioId, HOY);
    expect(await bonificarContrato(db, bonificacion(pagada.prodigal.id), "admin")).toEqual({
      ok: false,
      error: "ORDEN_NO_PENDIENTE",
    });
    // Una orden con un ticket aplicado.
    const conTicket = await ordenPendiente();
    const [ticket] = await db
      .insert(t.tickets)
      .values({
        codigo: "BONIF-PRUEBA",
        porcentaje: porcentaje("10"),
        tope: centavos("5000"),
        vigenteDesde: fecha("2026-01-01"),
        vigenteHasta: fecha("2026-12-31"),
      })
      .returning();
    await db
      .update(t.ordenes)
      .set({ ticketId: ticket!.id })
      .where(eq(t.ordenes.id, conTicket.ordenId));
    expect(await bonificarContrato(db, bonificacion(conTicket.prodigal.id), "admin")).toEqual({
      ok: false,
      error: "CON_TICKET",
    });
  });
});

describe("bonificación del 100 %", () => {
  it("si la orden queda sin importe, se da por pagada y activa sus paquetes", async () => {
    const { ordenId } = await ordenPendiente();
    const contratos = await db.query.contratos.findMany({
      where: eq(t.contratos.ordenId, ordenId),
    });
    for (const c of contratos) {
      await bonificarContrato(
        db,
        bonificacion(c.id, { porcentaje: porcentaje("100"), recurrente: false }),
        usuarioId,
      );
    }
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    expect(orden).toMatchObject({ estado: "PAGADA", total: 0n });
    const activos = await db.query.contratos.findMany({ where: eq(t.contratos.ordenId, ordenId) });
    expect(activos.every((c) => c.estado === "ACTIVO")).toBe(true);
  });
});

describe("recálculo con la foto fiscal vigente", () => {
  it("toma la condición frente al IVA y el ajuste del medio vigentes al bonificar", async () => {
    const { ordenId, prodigal } = await ordenPendiente();
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    // El cliente pasó a Consumidor Final después de confirmar la orden (era Inscripto).
    await db
      .update(t.clientes)
      .set({ condicionIva: "CONSUMIDOR_FINAL" })
      .where(eq(t.clientes.id, orden!.clienteFacturacionId));
    await db
      .update(t.mediosPago)
      .set({ ajustePorcentaje: porcentaje("-5") })
      .where(eq(t.mediosPago.id, orden!.medioPagoId));

    const r = await bonificarContrato(db, bonificacion(prodigal.id), "admin");
    await db
      .update(t.mediosPago)
      .set({ ajustePorcentaje: 0n })
      .where(eq(t.mediosPago.id, orden!.medioPagoId));
    // 235.200 − 5 % = 223.440; IVA 21 % = 46.922,40; total 270.362,40
    expect(r).toEqual({ ok: true, total: centavos("270362.40") });
    const recalculada = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    expect(recalculada).toMatchObject({
      condicionIva: "CONSUMIDOR_FINAL",
      codigoArca: 5,
      tipoComprobante: "B",
      ajustePagoPorcentaje: porcentaje("-5"),
    });
  });

  it("sin condición activa no se puede recalcular", async () => {
    const { ordenId, prodigal } = await ordenPendiente();
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    await db
      .update(t.clientes)
      .set({ condicionIva: "EXTERIOR" })
      .where(eq(t.clientes.id, orden!.clienteFacturacionId));
    expect(await bonificarContrato(db, bonificacion(prodigal.id), "admin")).toEqual({
      ok: false,
      error: "IVA_COND_INVALIDA",
    });
  });
});
