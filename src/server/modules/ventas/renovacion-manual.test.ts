import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { ventanasDeRenovacion } from "@/domain/procesos/calendario";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { procesoRenovacion } from "../procesos/renovacion";
import { agregarRenovacion, cambiarCantidad, listarCarrito, renovablesDeEmpresa } from "./carrito";
import { confirmarOrden, cotizarCarrito } from "./checkout";

const HOY = fecha("2026-10-10");
let db: Db;
let usuarioId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  usuarioId = (await db.query.usuarios.findFirst())!.id;
});

async function alternativa(nombre: "Mensual" | "Anual") {
  const [fila] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(and(eq(t.paquetes.codigo, "PRO-INICIAL"), eq(t.alternativas.nombre, nombre)));
  return fila!.id;
}

/** Empresa con Prodigal Inicial mensual ×2 vigente hasta el 31/10, con 10 % de bonificación recurrente. */
async function conContratoVigente() {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  const contrato = await crearContratoDePrueba(
    db,
    { empresaId: empresa.id, ordenId: orden.id },
    {
      codigoPaquete: "PRO-INICIAL",
      estado: "ACTIVO",
      desde: fecha("2026-10-01"),
      hasta: fecha("2026-10-31"),
      cantidad: 2,
    },
  );
  await db
    .update(t.contratos)
    .set({ bonifPorcentaje: porcentaje("10"), bonifRecurrente: true, bonifMotivo: "Cliente fiel" })
    .where(eq(t.contratos.id, contrato.id));
  return { empresa, contrato };
}

describe("renovación manual", () => {
  it("renueva con otra duración, empalmando fechas y con la bonificación recurrente", async () => {
    const { empresa, contrato } = await conContratoVigente();
    const [renovable] = await renovablesDeEmpresa(db, empresa.id, null, HOY);
    expect(renovable?.id).toBe(contrato.id);
    expect(renovable?.alternativas.map((a) => a.nombre)).toEqual(["Mensual", "Anual"]);

    const anual = await alternativa("Anual");
    expect(
      await agregarRenovacion(
        db,
        { empresaId: empresa.id, contratoId: contrato.id, alternativaId: anual, usuarioId },
        HOY,
      ),
    ).toEqual({ ok: true });
    // No se agrega dos veces.
    expect(
      await agregarRenovacion(
        db,
        { empresaId: empresa.id, contratoId: contrato.id, alternativaId: anual, usuarioId },
        HOY,
      ),
    ).toEqual({ ok: false, error: "NO_RENOVABLE" });
    expect(await renovablesDeEmpresa(db, empresa.id, null, HOY)).toEqual([]);

    const [item] = await listarCarrito(db, empresa.id);
    expect(item).toMatchObject({
      tipoAccion: "RENOVACION",
      cantidad: 2,
      anteriorHasta: "2026-10-31",
    });
    // La cantidad de una renovación no se cambia (se puede quitar).
    expect(
      await cambiarCantidad(db, { empresaId: empresa.id, itemId: item!.id, cantidad: 3 }),
    ).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });

    const cotizacion = await cotizarCarrito(db, empresa.id, {}, HOY);
    if (!cotizacion.ok) throw new Error(cotizacion.error);
    expect(cotizacion.valor.instancia).toBe("RENOVACION");
    // Renovación anual 378.000 × 2 − 10 % recurrente = 680.400.
    expect(cotizacion.valor.calculo.subtotal).toBe(centavos("680400"));

    const r = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!r.ok) throw new Error(r.error);
    const nuevo = await db.query.contratos.findFirst({
      where: eq(t.contratos.contratoAnteriorId, contrato.id),
    });
    expect(nuevo).toMatchObject({
      tipoAccion: "RENOVACION",
      estado: "PEND_PAGO",
      desde: "2026-11-01",
      hasta: "2027-10-31",
      cantidad: 2,
      meses: 12,
      bonifPorcentaje: porcentaje("10"),
      bonifRecurrente: true,
      bonifMotivo: "Cliente fiel",
    });

    // La renovación automática ya no lo toma.
    const resumen = await procesoRenovacion(db, ventanasDeRenovacion(fecha("2026-09-15")).at(-1)!);
    expect(resumen.errores).toEqual([]);
    expect(await db.$count(t.contratos, eq(t.contratos.contratoAnteriorId, contrato.id))).toBe(1);
  });

  it("si mientras estaba en el carrito se generó la renovación, no se duplica", async () => {
    const { empresa, contrato } = await conContratoVigente();
    await agregarRenovacion(
      db,
      {
        empresaId: empresa.id,
        contratoId: contrato.id,
        alternativaId: await alternativa("Mensual"),
        usuarioId,
      },
      HOY,
    );
    await procesoRenovacion(db, ventanasDeRenovacion(fecha("2026-09-15")).at(-1)!);
    expect(await db.$count(t.contratos, eq(t.contratos.contratoAnteriorId, contrato.id))).toBe(1);

    const r = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    expect(r).toMatchObject({ ok: false, error: "YA_RENOVADO", detalle: "Prodigal Inicial" });
    expect(await db.$count(t.contratos, eq(t.contratos.contratoAnteriorId, contrato.id))).toBe(1);
  });

  it("un paquete ya vencido no se renueva: se contrata de nuevo", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    await crearContratoDePrueba(
      db,
      { empresaId: empresa.id, ordenId: orden.id },
      {
        codigoPaquete: "PRO-INICIAL",
        estado: "ACTIVO",
        desde: fecha("2026-09-01"),
        hasta: fecha("2026-09-30"),
      },
    );
    expect(await renovablesDeEmpresa(db, empresa.id, null, HOY)).toEqual([]);
  });
});
