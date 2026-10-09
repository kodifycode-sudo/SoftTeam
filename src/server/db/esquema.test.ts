import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { crearDbPglite } from "./cliente";
import * as t from "./schema";

type DbPrueba = Awaited<ReturnType<typeof crearDbPglite>>;

let db: DbPrueba;
let ids: {
  empresaId: string;
  clienteId: string;
  paqueteId: string;
  alternativaId: string;
  medioPagoId: string;
};

/** Inserta lo mínimo para poder crear órdenes y contratos. */
async function sembrar(db: DbPrueba) {
  await db.insert(t.paises).values({
    id: "AR",
    nombre: "Argentina",
    prefijoTelefonico: "54",
    moneda: "ARS",
    alicuotaIvaGeneral: porcentaje("21"),
  });
  await db.insert(t.condicionesIva).values({
    codigo: "RESPONSABLE_INSCRIPTO",
    paisId: "AR",
    nombre: "IVA Responsable Inscripto",
    codigoArca: 1,
    alicuota: porcentaje("21"),
    comprobante: "A",
  });
  const [cliente] = await db
    .insert(t.clientes)
    .values({
      tipoPersona: "JURIDICA",
      nombre: "Broker Ejemplo SA",
      nombreFactura: "Broker Ejemplo SA",
      cuit: "30712345678",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "Florida 1",
        ciudad: "CABA",
        codigoPostal: "1005",
        provincia: "CABA",
        paisId: "AR",
      },
      contactoAdministrador: { nombre: "Ana", email: "ana@broker.com", telefono: null },
    })
    .returning();
  const [empresa] = await db
    .insert(t.empresas)
    .values({
      clienteId: cliente!.id,
      nombre: "Broker Ejemplo",
      nombreCorto: "BROKER",
      paisId: "AR",
    })
    .returning();
  const [paquete] = await db
    .insert(t.paquetes)
    .values({
      codigo: "PRO-FULL",
      nombre: "Prodigal Full",
      paisId: "AR",
      tipo: "TEMPORAL",
      ventaDesde: fecha("2026-01-01"),
    })
    .returning();
  const [alternativa] = await db
    .insert(t.alternativas)
    .values({
      paqueteId: paquete!.id,
      nombre: "Mensual",
      meses: 1,
      precioCompra: centavos("999999999999.99"),
      precioRenovacion: centavos("80000"),
    })
    .returning();
  const [medio] = await db
    .insert(t.mediosPago)
    .values({
      codigo: "TRANSF",
      nombre: "Transferencia",
      tipo: "TRANSFERENCIA",
      ajustePorcentaje: porcentaje("-5"),
    })
    .returning();
  return {
    empresaId: empresa!.id,
    clienteId: cliente!.id,
    paqueteId: paquete!.id,
    alternativaId: alternativa!.id,
    medioPagoId: medio!.id,
  };
}

async function crearOrden() {
  const [orden] = await db
    .insert(t.ordenes)
    .values({
      empresaId: ids.empresaId,
      clienteId: ids.clienteId,
      clienteFacturacionId: ids.clienteId,
      medioPagoId: ids.medioPagoId,
      moneda: "ARS",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      codigoArca: 1,
      tipoComprobante: "A",
      subtotalLista: 100n,
      bonificacionTotal: 0n,
      subtotal: 100n,
      baseNeta: 100n,
      ajustePagoPorcentaje: 0n,
      ajustePago: 0n,
      netoGravado: 100n,
      alicuotaIva: porcentaje("21"),
      iva: 21n,
      total: 121n,
    })
    .returning();
  return orden!;
}

function contratoBase(ordenId: string) {
  return {
    empresaId: ids.empresaId,
    paqueteId: ids.paqueteId,
    alternativaId: ids.alternativaId,
    ordenId,
    tipoAccion: "ALTA" as const,
    tipoPaquete: "TEMPORAL" as const,
    cantidad: 1,
    meses: 1,
    estado: "ACTIVO" as const,
    desde: fecha("2026-09-01"),
    hasta: fecha("2026-09-30"),
    precioLista: 100n,
    precioFinal: 100n,
  };
}

beforeAll(async () => {
  db = await crearDbPglite();
  ids = await sembrar(db);
});

describe("esquema de base de datos", () => {
  it("guarda y lee importes y porcentajes sin perder precisión", async () => {
    const [alt] = await db
      .select()
      .from(t.alternativas)
      .where(eq(t.alternativas.id, ids.alternativaId));
    expect(alt?.precioCompra).toBe(centavos("999999999999.99"));
    await expect(
      db.insert(t.alternativas).values({
        paqueteId: ids.paqueteId,
        nombre: "Desborde",
        meses: 1,
        precioCompra: centavos("1000000000000"),
        precioRenovacion: 0n,
      }),
    ).rejects.toThrow();
    const [medio] = await db
      .select()
      .from(t.mediosPago)
      .where(eq(t.mediosPago.id, ids.medioPagoId));
    expect(medio?.ajustePorcentaje).toBe(porcentaje("-5"));
  });

  it("numera clientes, empresas y órdenes con identidades", async () => {
    const [empresa] = await db.select().from(t.empresas);
    expect(empresa?.numero).toBe(2000);
    expect((await crearOrden()).numero).toBeGreaterThanOrEqual(10000);
  });

  it("rechaza un consumible con fecha de vencimiento", async () => {
    const orden = await crearOrden();
    await expect(
      db.insert(t.contratos).values({ ...contratoBase(orden.id), tipoPaquete: "CONSUMIBLE" }),
    ).rejects.toThrow();
  });

  it("rechaza períodos invertidos y bonificaciones fuera de rango", async () => {
    const orden = await crearOrden();
    await expect(
      db.insert(t.contratos).values({ ...contratoBase(orden.id), hasta: fecha("2026-08-01") }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(t.contratos)
        .values({ ...contratoBase(orden.id), bonifPorcentaje: porcentaje("150") }),
    ).rejects.toThrow();
  });

  it("no permite renovar dos veces el mismo contrato (idempotencia de la renovación)", async () => {
    const orden = await crearOrden();
    const [original] = await db.insert(t.contratos).values(contratoBase(orden.id)).returning();
    const renovacion = {
      ...contratoBase(orden.id),
      tipoAccion: "RENOVACION" as const,
      contratoAnteriorId: original!.id,
      estado: "PEND_PAGO" as const,
      desde: fecha("2026-10-01"),
      hasta: fecha("2026-10-31"),
    };
    await db.insert(t.contratos).values(renovacion);
    await expect(db.insert(t.contratos).values(renovacion)).rejects.toThrow();
  });

  it("exige que los movimientos de cupo mensual indiquen su período", async () => {
    const orden = await crearOrden();
    const [contrato] = await db.insert(t.contratos).values(contratoBase(orden.id)).returning();
    await db.insert(t.productos).values({ id: "notificaciones", nombre: "Notificaciones" });
    await db.insert(t.recursos).values({
      id: "notificaciones.mes",
      productoId: "notificaciones",
      nombre: "Notificaciones del mes",
      clase: "CUPO_MENSUAL",
    });
    const movimiento = {
      contratoId: contrato!.id,
      recursoId: "notificaciones.mes",
      clase: "CUPO_MENSUAL" as const,
      tipo: "CONSUMO" as const,
      creditos: -10,
    };
    await expect(db.insert(t.movimientosSaldo).values(movimiento)).rejects.toThrow();
    await db.insert(t.movimientosSaldo).values({ ...movimiento, periodo: "2026-09" });
    // Un consumo no puede ser positivo.
    await expect(
      db.insert(t.movimientosSaldo).values({ ...movimiento, periodo: "2026-09", creditos: 10 }),
    ).rejects.toThrow();
  });

  it("el saldo prepago del contrato acompaña cada movimiento (trigger)", async () => {
    const orden = await crearOrden();
    const [contrato] = await db.insert(t.contratos).values(contratoBase(orden.id)).returning();
    const contratoId = contrato!.id;
    await db.insert(t.productos).values({ id: "tickets", nombre: "Tickets" });
    await db.insert(t.recursos).values([
      { id: "tickets.saldo", productoId: "tickets", nombre: "Tickets", clase: "SALDO" },
      { id: "tickets.otro", productoId: "tickets", nombre: "Otro", clase: "SALDO" },
    ]);
    await db
      .insert(t.contratoRecursos)
      .values({ contratoId, recursoId: "tickets.saldo", clase: "SALDO", cantidad: 100 });
    const saldo = async () =>
      (
        await db.query.contratoRecursos.findFirst({
          where: eq(t.contratoRecursos.contratoId, contratoId),
        })
      )?.saldo;
    const base = { contratoId, recursoId: "tickets.saldo", clase: "SALDO" } as const;

    await db.insert(t.movimientosSaldo).values([
      { ...base, tipo: "CARGA", creditos: 100 },
      { ...base, tipo: "CONSUMO", creditos: -30 },
    ]);
    expect(await saldo()).toBe(70);

    // Una corrección o un borrado manual también lo actualizan.
    const [consumo] = await db
      .update(t.movimientosSaldo)
      .set({ creditos: -40 })
      .where(
        and(eq(t.movimientosSaldo.contratoId, contratoId), eq(t.movimientosSaldo.tipo, "CONSUMO")),
      )
      .returning();
    expect(await saldo()).toBe(60);
    await db.delete(t.movimientosSaldo).where(eq(t.movimientosSaldo.id, consumo!.id));
    expect(await saldo()).toBe(100);

    // Un movimiento de saldo de un recurso que el contrato no tiene no se acepta.
    await expect(
      db
        .insert(t.movimientosSaldo)
        .values({ ...base, recursoId: "tickets.otro", tipo: "CARGA", creditos: 5 }),
    ).rejects.toThrow();
    expect(await saldo()).toBe(100);
  });
});
