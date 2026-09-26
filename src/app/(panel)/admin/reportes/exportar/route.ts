import { importeCsv } from "@/domain/exportacion/csv";
import { hoy } from "@/domain/fecha";
import { CONDICIONES_IVA_ETIQUETA } from "@/lib/argentina";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import { listarClientes } from "@/server/modules/cuentas/consultas";
import {
  cobranzaPorMes,
  consumosPorEmpresa,
  consumosPorMes,
  empresasPorProducto,
  ordenesPendientes,
  vencimientos,
  ventasPorPaquete,
} from "@/server/modules/reportes/reportes";
import { listarOrdenes } from "@/server/modules/ventas/ordenes";

const ESTADOS_RENOVACION = {
  NO_RENOVAR: "No se renueva",
  SIN_ORDEN: "Sin orden de renovación",
  ORDEN_PENDIENTE: "Orden de renovación impaga",
  RENOVADO: "Renovado",
} as const;

const ESTADOS_ORDEN = { PEND_PAGO: "Pendiente", PAGADA: "Pagada", CANCELADA: "Cancelada" } as const;

/**
 * GET /admin/reportes/exportar?reporte=…: descarga en CSV (Excel) de cada
 * reporte y de los listados de órdenes y clientes, con los mismos filtros de
 * la pantalla. Solo SOFTeam.
 */
export async function GET(peticion: Request) {
  await requerirSofteam();
  const p = new URL(peticion.url).searchParams;
  const db = await obtenerDb();
  const fecha = hoy();

  switch (p.get("reporte")) {
    case "cobranza":
      return respuestaCsv("cobranza por mes", await cobranzaPorMes(db, fecha), [
        { titulo: "Mes", valor: (f) => f.mes },
        { titulo: "Órdenes emitidas", valor: (f) => f.ordenes },
        { titulo: "Emitido", valor: (f) => importeCsv(f.emitido) },
        { titulo: "Cobrado", valor: (f) => importeCsv(f.cobrado) },
        { titulo: "Pendiente", valor: (f) => importeCsv(f.pendiente) },
      ]);
    case "pendientes":
      return respuestaCsv("ordenes impagas", await ordenesPendientes(db, fecha), [
        { titulo: "Orden", valor: (f) => f.numero },
        { titulo: "Empresa", valor: (f) => f.empresa ?? "Facturación agrupada" },
        { titulo: "Cliente", valor: (f) => f.cliente },
        { titulo: "Medio de pago", valor: (f) => f.medio },
        {
          titulo: "Tipo",
          valor: (f) => (f.tipoGeneracion === "RENOVACION" ? "Renovación" : "Compra"),
        },
        { titulo: "Emitida", valor: (f) => f.emitidaEn },
        { titulo: "Días", valor: (f) => f.dias },
        { titulo: "Pago rechazado", valor: (f) => f.pagoError },
        { titulo: "Total", valor: (f) => importeCsv(f.total) },
      ]);
    case "vencimientos":
      return respuestaCsv("vencimientos", await vencimientos(db, fecha), [
        { titulo: "Empresa", valor: (f) => f.empresa },
        { titulo: "N.º empresa", valor: (f) => f.empresaNumero },
        { titulo: "Paquete", valor: (f) => f.paquete },
        { titulo: "Unidades", valor: (f) => f.cantidad },
        { titulo: "Vence", valor: (f) => f.hasta },
        { titulo: "Días", valor: (f) => f.dias },
        { titulo: "Renovación", valor: (f) => ESTADOS_RENOVACION[f.estado] },
        { titulo: "Orden de renovación", valor: (f) => f.ordenRenovacion },
      ]);
    case "consumos":
      return respuestaCsv("consumos por mes", await consumosPorMes(db, fecha, 12), [
        { titulo: "Mes", valor: (f) => f.mes },
        { titulo: "Familia", valor: (f) => f.familia },
        { titulo: "Créditos", valor: (f) => f.creditos },
        { titulo: "Operaciones", valor: (f) => f.operaciones },
      ]);
    case "consumos-empresas": {
      const mes = /^\d{4}-\d{2}$/.test(p.get("mes") ?? "")
        ? (p.get("mes") as string)
        : fecha.slice(0, 7);
      return respuestaCsv(`consumos por empresa ${mes}`, await consumosPorEmpresa(db, mes, 1000), [
        { titulo: "Empresa", valor: (f) => f.empresa },
        { titulo: "N.º empresa", valor: (f) => f.empresaNumero },
        { titulo: "Familia", valor: (f) => f.familia },
        { titulo: "Créditos", valor: (f) => f.creditos },
        { titulo: "Operaciones", valor: (f) => f.operaciones },
      ]);
    }
    case "productos":
      return respuestaCsv("empresas por producto", await empresasPorProducto(db, fecha), [
        { titulo: "Producto", valor: (f) => f.producto },
        { titulo: "Empresas", valor: (f) => f.empresas },
      ]);
    case "ventas":
      return respuestaCsv("ventas por paquete", await ventasPorPaquete(db, fecha), [
        { titulo: "Paquete", valor: (f) => f.paquete },
        { titulo: "Altas", valor: (f) => f.altas },
        { titulo: "Renovaciones", valor: (f) => f.renovaciones },
        { titulo: "Facturado con impuestos", valor: (f) => importeCsv(f.facturado) },
      ]);
    case "ordenes": {
      const estado = p.get("estado");
      const ordenes = await listarOrdenes(db, {
        estado:
          estado === "PEND_PAGO" || estado === "PAGADA" || estado === "CANCELADA"
            ? estado
            : undefined,
        busqueda: p.get("q") ?? undefined,
      });
      return respuestaCsv("ordenes", ordenes, [
        { titulo: "Orden", valor: (f) => f.numero },
        { titulo: "Empresa", valor: (f) => f.empresa ?? "Facturación agrupada" },
        { titulo: "Cliente", valor: (f) => f.cliente },
        { titulo: "Estado", valor: (f) => ESTADOS_ORDEN[f.estado] },
        {
          titulo: "Tipo",
          valor: (f) => (f.tipoGeneracion === "RENOVACION" ? "Renovación" : "Compra"),
        },
        { titulo: "Medio de pago", valor: (f) => f.medio },
        { titulo: "Emitida", valor: (f) => f.emitidaEn },
        { titulo: "Pagada", valor: (f) => f.pagadaEn },
        { titulo: "Factura", valor: (f) => f.facturaNumero },
        { titulo: "Total", valor: (f) => importeCsv(f.total) },
      ]);
    }
    case "clientes": {
      const clientes = await listarClientes(db, {
        busqueda: p.get("q") ?? undefined,
        inactivos: p.get("inactivos") === "1",
      });
      return respuestaCsv("clientes", clientes, [
        { titulo: "N.º cliente", valor: (f) => f.numero },
        { titulo: "Cliente", valor: (f) => f.nombre },
        { titulo: "CUIT", valor: (f) => f.cuit },
        { titulo: "Condición IVA", valor: (f) => CONDICIONES_IVA_ETIQUETA[f.condicionIva] },
        { titulo: "Administrador", valor: (f) => f.administrador },
        { titulo: "Mail", valor: (f) => f.email },
        { titulo: "Empresas", valor: (f) => f.empresas },
        { titulo: "Corporativo", valor: (f) => f.corporativo },
        { titulo: "Activo", valor: (f) => f.activo },
        { titulo: "Alta", valor: (f) => f.creadoEn },
      ]);
    }
    default:
      return new Response("Reporte inexistente", { status: 404 });
  }
}
