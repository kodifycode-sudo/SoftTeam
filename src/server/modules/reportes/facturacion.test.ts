import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centavos } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { rangoDeDias } from "@/domain/reportes/periodos";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { listarOrdenes } from "../ventas/ordenes";
import { libroDeVentas } from "./reportes";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

/** Orden emitida en una fecha, con su emisor, comprobante y (opcional) factura. */
async function orden(
  emitida: string,
  datos: { comprobante?: "A" | "B"; factura?: string; facturada?: string; modo?: number } = {},
) {
  const { empresa, cliente, orden } = await crearEmpresaDePrueba(db);
  const emisor = await db.query.emisores.findFirst();
  await db
    .update(t.ordenes)
    .set({
      emitidaEn: new Date(`${emitida}T15:00:00Z`),
      emisorId: emisor!.id,
      emisorRazonSocial: emisor!.razonSocial,
      tipoComprobante: datos.comprobante ?? "A",
      modoFacturacion: datos.modo ?? 0,
      facturaNumero: datos.factura ?? null,
      facturadaEn: datos.facturada ? new Date(`${datos.facturada}T15:00:00Z`) : null,
      netoGravado: centavos("1000"),
      iva: centavos("210"),
      total: centavos("1210"),
    })
    .where(eq(t.ordenes.id, orden.id));
  return { empresa, cliente, orden, emisorId: emisor!.id };
}

describe("filtros del listado de órdenes", () => {
  it("busca por número, CUIT o nombre y filtra por fecha, emisor y modo", async () => {
    const a = await orden("2031-03-10", { modo: 1 });
    const b = await orden("2031-04-20");
    const ids = async (filtros: Parameters<typeof listarOrdenes>[1]) =>
      (await listarOrdenes(db, filtros)).map((o) => o.id);

    expect(await ids({ busqueda: `#${a.orden.numero}` })).toEqual([a.orden.id]);
    expect(await ids({ busqueda: a.cliente.cuit })).toEqual([a.orden.id]);
    expect(await ids({ busqueda: a.cliente.nombre.slice(0, 8).toUpperCase() })).toContain(
      a.orden.id,
    );
    const marzo = rangoDeDias("2031-03-01", "2031-03-31", fecha("2031-06-15")).rango;
    expect(await ids({ emitidas: marzo })).toContain(a.orden.id);
    expect(await ids({ emitidas: marzo })).not.toContain(b.orden.id);
    expect(await ids({ modoFacturacion: 1, emisorId: a.emisorId })).toContain(a.orden.id);
    expect(await ids({ modoFacturacion: 1 })).not.toContain(b.orden.id);
  });
});

describe("libro de ventas", () => {
  it("lista las facturas del período, filtradas por comprobante", async () => {
    const a = await orden("2031-05-02", {
      comprobante: "A",
      factura: "A-0001-00000101",
      facturada: "2031-05-03",
    });
    const b = await orden("2031-05-05", {
      comprobante: "B",
      factura: "B-0001-00000102",
      facturada: "2031-05-06",
    });
    const sinFactura = await orden("2031-05-07");
    const mayo = rangoDeDias("2031-05-01", "2031-05-31", fecha("2031-06-15")).rango;

    const todas = (await libroDeVentas(db, { rango: mayo })).map((f) => f.ordenId);
    expect(todas).toEqual(expect.arrayContaining([a.orden.id, b.orden.id]));
    expect(todas).not.toContain(sinFactura.orden.id);

    const soloB = await libroDeVentas(db, { rango: mayo, comprobante: "B" });
    expect(soloB.map((f) => f.ordenId)).toEqual([b.orden.id]);
    expect(soloB[0]).toMatchObject({
      factura: "B-0001-00000102",
      netoGravado: centavos("1000"),
      iva: centavos("210"),
      total: centavos("1210"),
    });
    const junio = rangoDeDias("2031-06-01", "2031-06-30", fecha("2031-06-15")).rango;
    expect(await libroDeVentas(db, { rango: junio })).toEqual([]);
  });
});
