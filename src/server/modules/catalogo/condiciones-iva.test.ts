import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { crearFacturadorSimulado } from "@/server/cobros/facturador";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { facturarPendientes } from "../cobros/facturacion";
import { agregarAlCarrito } from "../ventas/carrito";
import { confirmarOrden, cotizarCarrito } from "../ventas/checkout";
import {
  condicionIvaValida,
  guardarCondicionIva,
  listarCondicionesIva,
  opcionesCondicionesIva,
} from "./condiciones-iva";

const HOY = fecha("2026-09-25");
let db: Db;
let usuarioId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  usuarioId = (await db.query.usuarios.findFirst())!.id;
});

const entrada = (parcial: Partial<Parameters<typeof guardarCondicionIva>[1]> = {}) => ({
  paisId: "AR",
  nombre: "Monotributo social",
  codigoArca: 13,
  alicuota: porcentaje("21"),
  comprobante: "B" as const,
  activa: true,
  orden: 10,
  ...parcial,
});

/** Empresa con un paquete en el carrito, cuyo cliente tiene la condición indicada. */
async function carritoCon(condicionIva: string) {
  const { empresa, cliente } = await crearEmpresaDePrueba(db);
  await db.delete(t.ordenes).where(eq(t.ordenes.empresaId, empresa.id));
  await db.update(t.clientes).set({ condicionIva }).where(eq(t.clientes.id, cliente.id));
  const [alt] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(and(eq(t.paquetes.codigo, "NOTI-10K"), eq(t.alternativas.nombre, "Pago único")));
  await agregarAlCarrito(
    db,
    { empresaId: empresa.id, alternativaId: alt!.id, cantidad: 1, usuarioId },
    HOY,
  );
  return empresa;
}

describe("condiciones frente al IVA configurables", () => {
  it("la carga inicial de Argentina trae las condiciones vigentes", async () => {
    const condiciones = await listarCondicionesIva(db, "AR");
    const por = (codigo: string) => condiciones.find((c) => c.codigo === codigo);
    // El exento paga IVA: la exención es de sus ventas, no de lo que compra.
    expect(por("EXENTO")).toMatchObject({ alicuota: porcentaje("21"), comprobante: "B" });
    expect(por("MONOTRIBUTO_A")).toMatchObject({ codigoArca: 6, comprobante: "A" });
    expect(por("GRAN_CONTRIBUYENTE")).toMatchObject({ codigoArca: 1, comprobante: "A" });
    expect(por("EXTERIOR")).toMatchObject({ activa: false, comprobante: "E" });
    expect((await opcionesCondicionesIva(db, "AR")).some((c) => c.codigo === "EXTERIOR")).toBe(
      false,
    );
  });

  it("Administración da de alta y edita condiciones, con auditoría", async () => {
    const alta = await guardarCondicionIva(db, entrada(), usuarioId);
    expect(alta).toEqual({ ok: true, codigo: "MONOTRIBUTO_SOCIAL" });
    expect(await condicionIvaValida(db, "AR", "MONOTRIBUTO_SOCIAL")).toBe(true);
    expect(await guardarCondicionIva(db, entrada(), usuarioId)).toEqual({
      ok: false,
      error: "REPETIDA",
    });

    await guardarCondicionIva(
      db,
      entrada({ codigo: "MONOTRIBUTO_SOCIAL", alicuota: porcentaje("10.5"), activa: false }),
      usuarioId,
    );
    const [editada] = (await listarCondicionesIva(db, "AR")).filter(
      (c) => c.codigo === "MONOTRIBUTO_SOCIAL",
    );
    expect(editada).toMatchObject({ alicuota: porcentaje("10.5"), activa: false });
    expect(await condicionIvaValida(db, "AR", "MONOTRIBUTO_SOCIAL")).toBe(false);
    const auditoria = await db.query.auditoria.findMany({
      where: and(
        eq(t.auditoria.entidad, "condicion_iva"),
        eq(t.auditoria.entidadId, "MONOTRIBUTO_SOCIAL"),
      ),
    });
    expect(auditoria.map((a) => a.accion).sort()).toEqual(["alta", "modificacion"]);
  });

  it("no se da de baja una condición que tienen clientes", async () => {
    await crearEmpresaDePrueba(db);
    expect(
      await guardarCondicionIva(
        db,
        entrada({
          codigo: "RESPONSABLE_INSCRIPTO",
          nombre: "IVA Responsable Inscripto",
          codigoArca: 1,
          comprobante: "A",
          activa: false,
        }),
        usuarioId,
      ),
    ).toEqual({ ok: false, error: "EN_USO" });
  });
});

describe("la orden toma el IVA de la condición del cliente de facturación", () => {
  it("exento: IVA al 21 % con Factura B, y la orden congela la condición y el código ARCA", async () => {
    const empresa = await carritoCon("EXENTO");
    const r = await cotizarCarrito(db, empresa.id, {}, HOY);
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.calculo.alicuotaIva).toBe(porcentaje("21"));
    expect(r.valor.tipoComprobante).toBe("B");

    const confirmada = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!confirmada.ok) throw new Error(confirmada.error);
    const orden = await db.query.ordenes.findFirst({
      where: eq(t.ordenes.id, confirmada.valor.ordenId),
    });
    expect(orden).toMatchObject({
      condicionIva: "EXENTO",
      codigoArca: 4,
      tipoComprobante: "B",
      alicuotaIva: porcentaje("21"),
    });
  });

  it("monotributo con Factura A: discrimina el IVA", async () => {
    const empresa = await carritoCon("MONOTRIBUTO_A");
    const r = await cotizarCarrito(db, empresa.id, {}, HOY);
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.tipoComprobante).toBe("A");
    expect(r.valor.clienteFacturacion.codigoArca).toBe(6);
  });

  it("un cambio de alícuota rige para las órdenes nuevas", async () => {
    const empresa = await carritoCon("CONSUMIDOR_FINAL");
    await db
      .update(t.condicionesIva)
      .set({ alicuota: porcentaje("10.5") })
      .where(eq(t.condicionesIva.codigo, "CONSUMIDOR_FINAL"));
    const r = await cotizarCarrito(db, empresa.id, {}, HOY);
    await db
      .update(t.condicionesIva)
      .set({ alicuota: porcentaje("21") })
      .where(eq(t.condicionesIva.codigo, "CONSUMIDOR_FINAL"));
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.calculo.alicuotaIva).toBe(porcentaje("10.5"));
  });

  it("sin condición activa o con comprobante E no se puede comprar", async () => {
    const empresa = await carritoCon("EXTERIOR");
    expect(await cotizarCarrito(db, empresa.id, {}, HOY)).toMatchObject({
      ok: false,
      error: "IVA_COND_INVALIDA",
    });
    await db
      .update(t.condicionesIva)
      .set({ activa: true })
      .where(eq(t.condicionesIva.codigo, "EXTERIOR"));
    const r = await cotizarCarrito(db, empresa.id, {}, HOY);
    await db
      .update(t.condicionesIva)
      .set({ activa: false })
      .where(eq(t.condicionesIva.codigo, "EXTERIOR"));
    expect(r).toMatchObject({ ok: false, error: "COMP_NO_HABILITADO" });
  });
});

describe("órdenes sin importe", () => {
  it("quedan pagadas al confirmar, activan los paquetes y no se facturan", async () => {
    const empresa = await carritoCon("RESPONSABLE_INSCRIPTO");
    await db.insert(t.tickets).values({
      codigo: "CORTESIA",
      porcentaje: porcentaje("100"),
      tope: centavos("100000000"),
      vigenteDesde: fecha("2026-01-01"),
      vigenteHasta: fecha("2026-12-31"),
    });
    const confirmada = await confirmarOrden(
      db,
      {
        empresaId: empresa.id,
        usuarioId,
        ticketCodigo: "CORTESIA",
        claveIdempotencia: crypto.randomUUID(),
      },
      HOY,
    );
    if (!confirmada.ok) throw new Error(confirmada.error);
    const ordenId = confirmada.valor.ordenId;
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    expect(orden).toMatchObject({ estado: "PAGADA", total: 0n });
    const contratos = await db.query.contratos.findMany({
      where: eq(t.contratos.ordenId, ordenId),
    });
    expect(contratos.map((c) => c.estado)).toEqual(["ACTIVO"]);

    await facturarPendientes(db, crearFacturadorSimulado());
    const despues = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, ordenId) });
    expect(despues?.facturadaEn).toBeNull();
  });
});
