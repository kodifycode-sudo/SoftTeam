import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { licenciaDeEmpresa } from "../licencias/licencia-empresa";
import { agregarAlCarrito, cambiarCantidad, listarCarrito } from "./carrito";
import { confirmarOrden, cotizarCarrito } from "./checkout";
import { cancelarOrden, obtenerOrden, registrarPago } from "./ordenes";

const HOY = fecha("2026-09-25");
let db: Db;
let usuarioId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  usuarioId = (await db.query.usuarios.findFirst())!.id;
});

async function alternativa(codigoPaquete: string, nombre: string) {
  const [fila] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(and(eq(t.paquetes.codigo, codigoPaquete), eq(t.alternativas.nombre, nombre)));
  return fila!.id;
}

async function medio(codigo: string) {
  return (await db.query.mediosPago.findFirst({ where: eq(t.mediosPago.codigo, codigo) }))!;
}

async function empresaConCarrito(modoFacturacion: 0 | 1 | 2 | 3 = 0) {
  const { empresa } = await crearEmpresaDePrueba(db, { modoFacturacion });
  // La empresa de prueba trae una orden vacía; la borramos para que sea un alta inicial.
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
  return empresa;
}

describe("carrito", () => {
  it("suma cantidades de la misma alternativa y permite cambiarlas o quitarlas", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const alt = await alternativa("CW-PRO", "Mensual");
    await agregarAlCarrito(
      db,
      { empresaId: empresa.id, alternativaId: alt, cantidad: 1, usuarioId },
      HOY,
    );
    await agregarAlCarrito(
      db,
      { empresaId: empresa.id, alternativaId: alt, cantidad: 2, usuarioId },
      HOY,
    );
    const [item] = await listarCarrito(db, empresa.id);
    expect(item?.cantidad).toBe(3);

    await cambiarCantidad(db, { empresaId: empresa.id, itemId: item!.id, cantidad: 0 });
    expect(await listarCarrito(db, empresa.id)).toEqual([]);
  });

  it("no deja agregar paquetes privados ni tocar el carrito de otra empresa", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    const otra = await crearEmpresaDePrueba(db);
    const alt = await alternativa("PRO-FULL", "Mensual");
    await db.update(t.paquetes).set({ privado: true }).where(eq(t.paquetes.codigo, "PRO-FULL"));
    expect(
      await agregarAlCarrito(
        db,
        { empresaId: empresa.id, alternativaId: alt, cantidad: 1, usuarioId },
        HOY,
      ),
    ).toEqual({ ok: false, error: "NO_DISPONIBLE" });
    await db.update(t.paquetes).set({ privado: false }).where(eq(t.paquetes.codigo, "PRO-FULL"));

    await agregarAlCarrito(
      db,
      { empresaId: empresa.id, alternativaId: alt, cantidad: 1, usuarioId },
      HOY,
    );
    const [item] = await listarCarrito(db, empresa.id);
    expect(
      await cambiarCantidad(db, { empresaId: otra.empresa.id, itemId: item!.id, cantidad: 5 }),
    ).toEqual({
      ok: false,
      error: "NO_EXISTE",
    });
  });
});

describe("cotizarCarrito", () => {
  it("aplica cantidad, ajuste del medio de pago e IVA", async () => {
    const empresa = await empresaConCarrito();
    const transferencia = await medio("TRANSF");
    await db
      .update(t.mediosPago)
      .set({ ajustePorcentaje: porcentaje("-10") })
      .where(eq(t.mediosPago.id, transferencia.id));

    const r = await cotizarCarrito(db, empresa.id, { medioPagoId: transferencia.id }, HOY);
    if (!r.ok) throw new Error(r.error);
    // Trimestre inicial: 2 × 114.000 + 30.000 = 258.000; −10 % = 232.200; IVA 21 % = 48.762
    expect(r.valor.calculo.subtotal).toBe(centavos("258000"));
    expect(r.valor.calculo.ajustePago).toBe(centavos("-25800"));
    expect(r.valor.calculo.iva).toBe(centavos("48762"));
    expect(r.valor.calculo.total).toBe(centavos("280962"));
    expect(r.valor).toMatchObject({ situacion: "TRIMESTRE_INICIAL", diaVenc: null, diasVenc: [] });
    expect(r.valor.instancia).toBe("ALTA_INICIAL");
    expect(r.valor.tipoComprobante).toBe("A");

    await db
      .update(t.mediosPago)
      .set({ ajustePorcentaje: 0n })
      .where(eq(t.mediosPago.id, transferencia.id));
  });

  it("rechaza un medio no habilitado para el alta", async () => {
    const empresa = await empresaConCarrito();
    const suscripcion = await medio("SUSC_MP");
    expect(
      await cotizarCarrito(db, empresa.id, { medioPagoId: suscripcion.id }, HOY),
    ).toMatchObject({
      ok: false,
      error: "MEDIO_NO_HABILITADO",
    });
  });

  it("aplica un ticket vigente con tope", async () => {
    const empresa = await empresaConCarrito();
    await db
      .insert(t.tickets)
      .values({
        codigo: "BIENVENIDA",
        porcentaje: porcentaje("15"),
        tope: centavos("5000"),
        vigenteDesde: fecha("2026-01-01"),
        vigenteHasta: fecha("2026-12-31"),
      })
      .onConflictDoNothing();
    const r = await cotizarCarrito(db, empresa.id, { ticketCodigo: "bienvenida" }, HOY);
    if (!r.ok) throw new Error(r.error);
    expect(r.valor.calculo.ticketDescuento).toBe(centavos("5000"));
    expect(r.valor.ticket?.codigo).toBe("BIENVENIDA");
  });
});

describe("confirmarOrden y pago", () => {
  it("cliente directo: la orden queda pendiente y los contratos sin período hasta pagar", async () => {
    const empresa = await empresaConCarrito();
    const clave = crypto.randomUUID();
    const r = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: clave },
      HOY,
    );
    if (!r.ok) throw new Error(r.error);

    const orden = await obtenerOrden(db, r.valor.ordenId, { empresaId: empresa.id });
    expect(orden?.orden.estado).toBe("PEND_PAGO");
    expect(orden?.lineas.map((l) => l.estadoContrato)).toEqual(["PEND_PAGO", "PEND_PAGO"]);
    expect(orden?.lineas.every((l) => l.desde === null)).toBe(true);
    expect(orden?.lineas.reduce((a, l) => a + l.totalProrrateado, 0n)).toBe(orden?.orden.total);
    expect(await listarCarrito(db, empresa.id)).toEqual([]);
    expect((await licenciaDeEmpresa(db, empresa.id, HOY)).productos).toEqual([]);

    // Doble envío con la misma clave: devuelve la misma orden.
    const repetida = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: clave },
      HOY,
    );
    expect(repetida).toEqual({ ok: true, valor: { ...r.valor, repetida: true } });

    // El pago activa: el período empieza el día del pago, y se acredita el saldo prepago.
    const pagoEl = fecha("2026-10-02");
    expect(await registrarPago(db, r.valor.ordenId, usuarioId, pagoEl)).toEqual({
      ok: true,
      valor: { contratosActivados: 2 },
    });
    const pagada = await obtenerOrden(db, r.valor.ordenId);
    const temporal = pagada?.lineas.find((l) => l.tipoPaquete === "TEMPORAL");
    expect(temporal).toMatchObject({
      estadoContrato: "ACTIVO",
      desde: "2026-10-02",
      hasta: "2027-01-01",
    });

    const licencia = await licenciaDeEmpresa(db, empresa.id, pagoEl);
    const items = licencia.productos.flatMap((p) => p.items);
    expect(items.find((i) => i.recursoId === "prodigal.usuarios")?.total).toBe(4);
    expect(items.find((i) => i.recursoId === "notificaciones.saldo")?.disponible).toBe(10000);
    // 2 unidades duplican usuarios, pero no los años de retención de cartera.
    expect(items.find((i) => i.recursoId === "prodigal.retencion")?.total).toBe(2);

    // Pagar dos veces no duplica saldos.
    expect(await registrarPago(db, r.valor.ordenId, usuarioId, pagoEl)).toEqual({
      ok: false,
      error: "NO_PENDIENTE",
    });
  });

  it("cliente corporativo: los paquetes quedan habilitados sin esperar el pago", async () => {
    const empresa = await empresaConCarrito(3);
    const r = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!r.ok) throw new Error(r.error);
    const orden = await obtenerOrden(db, r.valor.ordenId);
    expect(orden?.orden.estado).toBe("PEND_PAGO");
    expect(orden?.lineas.find((l) => l.tipoPaquete === "TEMPORAL")).toMatchObject({
      estadoContrato: "PEND_PAGO_ACTIVO",
      desde: "2026-09-25",
      hasta: "2026-12-24",
    });
    const items = (await licenciaDeEmpresa(db, empresa.id, HOY)).productos.flatMap((p) => p.items);
    expect(items.find((i) => i.recursoId === "prodigal.usuarios")?.total).toBe(4);
  });

  it("cancelar una orden pendiente cancela sus contratos", async () => {
    const empresa = await empresaConCarrito(3);
    const r = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!r.ok) throw new Error(r.error);
    expect(
      await cancelarOrden(db, r.valor.ordenId, usuarioId, "El cliente desistió"),
    ).toMatchObject({ ok: true });
    const orden = await obtenerOrden(db, r.valor.ordenId);
    expect(orden?.orden.estado).toBe("CANCELADA");
    expect(orden?.lineas.every((l) => l.estadoContrato === "CANCELADO")).toBe(true);
    expect((await licenciaDeEmpresa(db, empresa.id, HOY)).productos).toEqual([]);
  });

  it("el portal no puede ver órdenes de otra empresa", async () => {
    const empresa = await empresaConCarrito();
    const otra = await crearEmpresaDePrueba(db);
    const r = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!r.ok) throw new Error(r.error);
    expect(await obtenerOrden(db, r.valor.ordenId, { empresaId: otra.empresa.id })).toBeUndefined();
  });

  it("con el carrito vacío no hay orden", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    expect(
      await confirmarOrden(
        db,
        { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
        HOY,
      ),
    ).toMatchObject({ ok: false, error: "SIN_ITEMS" });
  });
});
