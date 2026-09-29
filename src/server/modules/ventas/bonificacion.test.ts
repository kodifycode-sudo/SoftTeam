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

/** Orden por transferencia (sin ajuste): Prodigal Inicial mensual ×2 ($76.000) + Notificaciones ($30.000). */
async function ordenPendiente() {
  const { empresa } = await crearEmpresaDePrueba(db);
  await db.delete(t.ordenes).where(eq(t.ordenes.empresaId, empresa.id));
  await agregarAlCarrito(
    db,
    {
      empresaId: empresa.id,
      alternativaId: await alternativa("PRO-INICIAL", "Mensual"),
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
    // (76.000 − 10 % + 30.000) × 1,21 = 98.400 × 1,21 = 119.064
    expect(r).toEqual({ ok: true, total: centavos("119064") });

    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    expect(orden).toMatchObject({
      subtotalLista: centavos("106000"),
      bonificacionTotal: centavos("7600"),
      subtotal: centavos("98400"),
      total: centavos("119064"),
      linkPagoUrl: null,
    });
    const items = await db.query.ordenItems.findMany({ where: eq(t.ordenItems.ordenId, ordenId) });
    expect(items.reduce((s, i) => s + i.totalProrrateado, 0n)).toBe(centavos("119064"));
    const contrato = await db.query.contratos.findFirst({ where: eq(t.contratos.id, prodigal.id) });
    expect(contrato).toMatchObject({
      bonifPorcentaje: porcentaje("10"),
      bonifRecurrente: true,
      bonifMotivo: "Cliente de muchos años",
      precioFinal: centavos("68400"),
    });

    // 0 % la quita.
    await bonificarContrato(db, bonificacion(prodigal.id, { porcentaje: 0n }), "admin");
    const sinBonif = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    expect(sinBonif?.total).toBe(centavos("128260"));
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
