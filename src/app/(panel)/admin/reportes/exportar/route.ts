import { formatearCuit } from "@/domain/cuentas/cuit";
import { importeCsv } from "@/domain/exportacion/csv";
import { type ModoFacturacion, NOMBRE_MODO } from "@/domain/facturacion/modo";
import { hoy } from "@/domain/fecha";
import { rangoDeDias, rangoDeMeses } from "@/domain/reportes/periodos";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import { listarCatalogoAseguradoras } from "@/server/modules/catalogo/aseguradoras";
import { listarPaquetes } from "@/server/modules/catalogo/paquetes";
import { listarClientes } from "@/server/modules/cuentas/consultas";
import {
  cobranzaPorMes,
  consumosPorEmpresa,
  consumosPorMes,
  empresasPorProducto,
  libroDeVentas,
  ordenesPendientes,
  vencimientos,
  ventasPorPaquete,
} from "@/server/modules/reportes/reportes";
import { listarOrdenes } from "@/server/modules/ventas/ordenes";
import { filtrosDeOrdenes } from "../../ordenes/filtros";

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
  // Período de cobranza y ventas: el mismo que se ve en la pantalla.
  const periodo = rangoDeMeses(p.get("desde") ?? undefined, p.get("hasta") ?? undefined, fecha);

  switch (p.get("reporte")) {
    case "cobranza":
      return respuestaCsv("cobranza por mes", await cobranzaPorMes(db, periodo.meses), [
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
    case "facturacion": {
      const dias = rangoDeDias(p.get("desde") ?? undefined, p.get("hasta") ?? undefined, fecha);
      const comprobante = p.get("comprobante");
      const filas = await libroDeVentas(db, {
        rango: dias.rango,
        emisorId: p.get("emisor") || undefined,
        comprobante: comprobante === "A" || comprobante === "B" ? comprobante : undefined,
      });
      return respuestaCsv("libro de ventas", filas, [
        { titulo: "Fecha", valor: (f) => f.facturadaEn },
        { titulo: "Comprobante", valor: (f) => `Factura ${f.comprobante}` },
        { titulo: "Número", valor: (f) => f.factura },
        { titulo: "Emisor", valor: (f) => f.emisor },
        { titulo: "CUIT emisor", valor: (f) => (f.emisorCuit ? formatearCuit(f.emisorCuit) : "") },
        { titulo: "Cliente", valor: (f) => f.cliente },
        { titulo: "CUIT cliente", valor: (f) => formatearCuit(f.clienteCuit) },
        { titulo: "Condición frente al IVA", valor: (f) => f.condicionIva },
        { titulo: "Moneda", valor: (f) => f.moneda },
        { titulo: "Neto gravado", valor: (f) => importeCsv(f.netoGravado) },
        { titulo: "Alícuota IVA", valor: (f) => importeCsv(f.alicuotaIva) },
        { titulo: "IVA", valor: (f) => importeCsv(f.iva) },
        { titulo: "Total", valor: (f) => importeCsv(f.total) },
        { titulo: "Orden", valor: (f) => f.orden },
        { titulo: "Estado de la orden", valor: (f) => ESTADOS_ORDEN[f.estado] },
      ]);
    }
    case "ventas":
      return respuestaCsv("ventas por paquete", await ventasPorPaquete(db, periodo.rango), [
        { titulo: "Paquete", valor: (f) => f.paquete },
        { titulo: "Altas", valor: (f) => f.altas },
        { titulo: "Renovaciones", valor: (f) => f.renovaciones },
        { titulo: "Facturado con impuestos", valor: (f) => importeCsv(f.facturado) },
      ]);
    case "ordenes": {
      const estado = p.get("estado");
      const filtros = filtrosDeOrdenes(p, fecha);
      const ordenes = await listarOrdenes(db, {
        estado:
          estado === "PEND_PAGO" || estado === "PAGADA" || estado === "CANCELADA"
            ? estado
            : undefined,
        busqueda: filtros.busqueda,
        emitidas: filtros.emitidas?.rango,
        emisorId: filtros.emisorId,
        medioPagoId: filtros.medioPagoId,
        modoFacturacion: filtros.modoFacturacion,
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
        { titulo: "Condición IVA", valor: (f) => f.condicionIvaNombre },
        { titulo: "Administrador", valor: (f) => f.administrador },
        { titulo: "Mail", valor: (f) => f.email },
        { titulo: "Empresas", valor: (f) => f.empresas },
        {
          titulo: "Modo de facturación",
          valor: (f) => NOMBRE_MODO[f.modoFacturacion as ModoFacturacion],
        },
        { titulo: "Activo", valor: (f) => f.activo },
        { titulo: "Alta", valor: (f) => f.creadoEn },
      ]);
    }
    case "aseguradoras":
      // Mismos títulos que la importación: el archivo se puede volver a importar.
      return respuestaCsv("aseguradoras", await listarCatalogoAseguradoras(db), [
        { titulo: "Nombre", valor: (f) => f.nombre },
        { titulo: "Abreviatura", valor: (f) => f.abreviatura },
        { titulo: "Código SSN", valor: (f) => f.codigoLegal },
        { titulo: "Interfaz con Prodigal", valor: (f) => f.interfazProdigalDisponible },
        { titulo: "Interfaz con CotiWeb", valor: (f) => f.interfazCotiwebDisponible },
        { titulo: "Interfaz de documentos", valor: (f) => f.interfazDocumentosDisponible },
        { titulo: "Discontinuada", valor: (f) => !f.activa },
        { titulo: "Empresas", valor: (f) => f.empresas },
        { titulo: "Con Prodigal", valor: (f) => f.conProdigal },
        { titulo: "Con CotiWeb", valor: (f) => f.conCotiweb },
      ]);
    case "paquetes": {
      // Una fila por alternativa de precio.
      const paquetes = await listarPaquetes(db, { hoy: fecha, inactivos: true });
      const filas = paquetes.flatMap((p) => p.alternativas.map((a) => ({ p, a })));
      return respuestaCsv("paquetes", filas, [
        { titulo: "Código", valor: (f) => f.p.codigo },
        { titulo: "Paquete", valor: (f) => f.p.nombre },
        { titulo: "Tipo", valor: (f) => (f.p.tipo === "TEMPORAL" ? "Temporal" : "Consumible") },
        { titulo: "Privado", valor: (f) => f.p.privado },
        { titulo: "Activo", valor: (f) => f.p.activo },
        { titulo: "Se vende hoy", valor: (f) => f.p.vendible },
        { titulo: "Venta desde", valor: (f) => f.p.ventaDesde },
        { titulo: "Venta hasta", valor: (f) => f.p.ventaHasta },
        {
          titulo: "Incluye",
          valor: (f) =>
            f.p.recursos
              .map((r) => `${r.nombre}: ${r.cantidad}${r.unidad ? ` ${r.unidad}` : ""}`)
              .join(", "),
        },
        { titulo: "Alternativa", valor: (f) => f.a.nombre },
        { titulo: "Meses", valor: (f) => f.a.meses },
        { titulo: "Precio de compra", valor: (f) => importeCsv(f.a.precioCompra) },
        { titulo: "Precio de renovación", valor: (f) => importeCsv(f.a.precioRenovacion) },
        { titulo: "Alternativa activa", valor: (f) => f.a.activa },
        { titulo: "Contratos vigentes", valor: (f) => f.p.contratosVigentes },
      ]);
    }
    default:
      return new Response("Reporte inexistente", { status: 404 });
  }
}
