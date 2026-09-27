import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import { fecha } from "@/domain/fecha";
import { ventanasDeRenovacion } from "@/domain/procesos/calendario";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { avisosDeEmpresa } from "../procesos/alertas";
import { procesoRenovacion } from "../procesos/renovacion";
import { agregarAlCarrito } from "../ventas/carrito";
import { confirmarOrden } from "../ventas/checkout";
import {
  asignarFacturacionOficina,
  cancelarPedidoFacturacion,
  facturacionDeOficinas,
  pedidosPendientes,
  pedirFacturacionOficina,
  resolverPedidoFacturacion,
} from "./facturacion-oficinas";
import { crearOficina } from "./oficinas";

const HOY = fecha("2026-09-25");
let db: Db;
let usuarioId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  usuarioId = (await db.query.usuarios.findFirst())!.id;
});

/** Empresa con una oficina y otro cliente (monotributista) al que facturarle sus compras. */
async function preparar() {
  const { empresa, cliente } = await crearEmpresaDePrueba(db);
  await db.delete(t.ordenes).where(eq(t.ordenes.empresaId, empresa.id));
  const r = await crearOficina(db, empresa.id, { nombre: "Rosario", canalNuevo: "Norte" }, "actor");
  if (!r.ok) throw new Error(r.error);
  const oficina = (await db.query.oficinas.findFirst({
    where: and(eq(t.oficinas.empresaId, empresa.id), eq(t.oficinas.nombre, "Rosario")),
  }))!;
  const { cliente: otro } = await crearEmpresaDePrueba(db);
  await db
    .update(t.clientes)
    .set({ condicionIva: "MONOTRIBUTO", nombreFactura: "Productor Rosario" })
    .where(eq(t.clientes.id, otro.id));
  return { empresa, cliente, oficina, otro };
}

async function comprar(empresaId: string, oficinaId: string | null) {
  const [alt] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(and(eq(t.paquetes.codigo, "PRO-INICIAL"), eq(t.alternativas.nombre, "Mensual")));
  await agregarAlCarrito(
    db,
    { empresaId, oficinaId, alternativaId: alt!.id, cantidad: 1, usuarioId },
    HOY,
  );
  const r = await confirmarOrden(
    db,
    { empresaId, oficinaId, usuarioId, claveIdempotencia: crypto.randomUUID() },
    HOY,
  );
  if (!r.ok) throw new Error(r.error);
  return (await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, r.valor.ordenId) }))!;
}

describe("facturación de la compra delegada", () => {
  it("SOFTeam asigna el cliente por CUIT o número, con validaciones y auditoría", async () => {
    const { empresa, cliente, oficina, otro } = await preparar();
    const asignar = (valor: string) =>
      asignarFacturacionOficina(db, { oficinaId: oficina.id, cliente: valor }, "actor");

    expect(await asignar("20-99999999-7")).toEqual({ ok: false, error: "CLIENTE_INEXISTENTE" });
    expect(await asignar(cliente.cuit)).toEqual({ ok: false, error: "MISMO_CLIENTE" });
    expect(await asignar(String(otro.numero))).toEqual({
      ok: true,
      cliente: { nombreFactura: "Productor Rosario" },
    });
    expect(
      await asignar(`${otro.cuit.slice(0, 2)}-${otro.cuit.slice(2, 10)}-${otro.cuit.slice(10)}`),
    ).toMatchObject({
      ok: true,
    });
    const [fila] = await facturacionDeOficinas(db, [empresa.id]);
    expect(fila?.cliente?.id).toBe(otro.id);

    await db.update(t.clientes).set({ activo: false }).where(eq(t.clientes.id, otro.id));
    expect(await asignar(otro.cuit)).toEqual({ ok: false, error: "CLIENTE_INACTIVO" });
    expect(await asignar("")).toEqual({ ok: true, cliente: null });

    const auditoria = await db.query.auditoria.findMany({
      where: and(eq(t.auditoria.entidadId, oficina.id), eq(t.auditoria.accion, "facturacion")),
    });
    expect(auditoria).toHaveLength(3);
  });

  it("la compra de la oficina se factura al otro cliente, con su comprobante", async () => {
    const { empresa, cliente, oficina, otro } = await preparar();
    await asignarFacturacionOficina(db, { oficinaId: oficina.id, cliente: otro.cuit }, "actor");

    const delegada = await comprar(empresa.id, oficina.id);
    expect(delegada).toMatchObject({
      clienteId: cliente.id,
      clienteFacturacionId: otro.id,
      condicionIva: "MONOTRIBUTO",
      tipoComprobante: "B",
    });
    // La compra de la empresa sigue facturándose a su cliente.
    expect(await comprar(empresa.id, null)).toMatchObject({
      clienteFacturacionId: cliente.id,
      tipoComprobante: "A",
    });

    // Con el otro cliente inactivo, vuelve a facturarse a la empresa.
    await db.update(t.clientes).set({ activo: false }).where(eq(t.clientes.id, otro.id));
    expect(await comprar(empresa.id, oficina.id)).toMatchObject({
      clienteFacturacionId: cliente.id,
    });
  });

  it("la renovación de un paquete de la oficina se factura igual que la compra", async () => {
    const { empresa, oficina, otro } = await preparar();
    await asignarFacturacionOficina(db, { oficinaId: oficina.id, cliente: otro.cuit }, "actor");
    // El contrato a renovar cuelga de una compra de la oficina (ya facturada al otro cliente).
    const orden = await comprar(empresa.id, oficina.id);
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
    await db
      .update(t.contratos)
      .set({ oficinaId: oficina.id })
      .where(eq(t.contratos.id, contrato.id));

    const resumen = await procesoRenovacion(db, ventanasDeRenovacion(fecha("2026-09-15")).at(-1)!);
    expect(resumen.errores).toEqual([]);
    const nuevo = await db.query.contratos.findFirst({
      where: eq(t.contratos.contratoAnteriorId, contrato.id),
    });
    expect(nuevo?.oficinaId).toBe(oficina.id);
    const renovacion = await db.query.ordenes.findFirst({
      where: eq(t.ordenes.id, nuevo!.ordenId),
    });
    expect(renovacion).toMatchObject({ clienteFacturacionId: otro.id, tipoComprobante: "B" });
  });

  it("la empresa pide el cambio y SOFTeam lo rechaza con motivo o lo aprueba", async () => {
    const { empresa, cliente, oficina, otro } = await preparar();
    const delegado = {
      usuarioId,
      alcance: { tipo: "oficina", canalId: oficina.canalId, oficinaId: oficina.id } as const,
    };
    const pedir = (cuit: string | null, actor = delegado) =>
      pedirFacturacionOficina(db, empresa.id, { oficinaId: oficina.id, cuit }, actor);

    // Un delegado de otra oficina no puede pedir por esta.
    expect(
      await pedir(otro.cuit, {
        usuarioId,
        alcance: { tipo: "oficina", canalId: oficina.canalId, oficinaId: crypto.randomUUID() },
      }),
    ).toEqual({ ok: false, error: "OFICINA_INEXISTENTE" });
    expect(await pedir(cliente.cuit)).toEqual({ ok: false, error: "MISMO_CLIENTE" });
    expect(await pedir(null)).toEqual({ ok: false, error: "SIN_CAMBIO" });

    const primero = await pedir(otro.cuit);
    if (!primero.ok) throw new Error(primero.error);
    expect(await pedir(otro.cuit)).toEqual({ ok: false, error: "YA_PENDIENTE" });
    const alertaSofteam = await db.query.alertas.findFirst({
      where: eq(t.alertas.claveDeduplicacion, `FACTURACION_SOLICITADA:${primero.id}`),
    });
    expect(alertaSofteam).toMatchObject({ paraCliente: false, estado: "PENDIENTE" });

    // Rechazo: exige motivo y le avisa a la oficina.
    expect(
      await resolverPedidoFacturacion(db, { solicitudId: primero.id, aprobar: false }, usuarioId),
    ).toEqual({ ok: false, error: "FALTA_MOTIVO" });
    expect(
      await resolverPedidoFacturacion(
        db,
        {
          solicitudId: primero.id,
          aprobar: false,
          respuesta: "Falta la conformidad del productor",
        },
        usuarioId,
      ),
    ).toEqual({ ok: true });
    const avisos = await avisosDeEmpresa(db, empresa.id, 50, delegado.alcance);
    expect(avisos.map((a) => a.mensaje)).toContainEqual(
      expect.stringContaining("Falta la conformidad del productor"),
    );
    expect(
      (await db.query.alertas.findFirst({ where: eq(t.alertas.id, alertaSofteam!.id) }))?.estado,
    ).toBe("DESCARTADA");

    // Un CUIT que todavía no es cliente no se puede aprobar: el pedido sigue pendiente.
    const sinRegistrar = await pedir("20123456786");
    if (!sinRegistrar.ok) throw new Error(sinRegistrar.error);
    expect(
      await resolverPedidoFacturacion(
        db,
        { solicitudId: sinRegistrar.id, aprobar: true },
        usuarioId,
      ),
    ).toEqual({ ok: false, error: "CLIENTE_INEXISTENTE" });
    expect(await pedidosPendientes(db, [empresa.id])).toHaveLength(1);
    expect(await cancelarPedidoFacturacion(db, empresa.id, sinRegistrar.id, delegado)).toBe(true);
    expect(await pedidosPendientes(db, [empresa.id])).toEqual([]);

    // Aprobación: rige en el acto.
    const segundo = await pedir(otro.cuit);
    if (!segundo.ok) throw new Error(segundo.error);
    expect(
      await resolverPedidoFacturacion(db, { solicitudId: segundo.id, aprobar: true }, usuarioId),
    ).toEqual({ ok: true });
    expect(
      await resolverPedidoFacturacion(db, { solicitudId: segundo.id, aprobar: true }, usuarioId),
    ).toEqual({ ok: false, error: "NO_PENDIENTE" });
    const [fila] = await facturacionDeOficinas(db, [empresa.id]);
    expect(fila?.cliente?.id).toBe(otro.id);
    expect(
      (await avisosDeEmpresa(db, empresa.id, 50, TODA_LA_EMPRESA)).some((a) =>
        a.mensaje.includes("Aprobamos tu pedido"),
      ),
    ).toBe(true);
  });
});
