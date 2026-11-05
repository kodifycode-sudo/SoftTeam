import { formatearCuit } from "@/domain/cuentas/cuit";
import { importeCsv } from "@/domain/exportacion/csv";
import { type ModoFacturacion, NOMBRE_MODO } from "@/domain/facturacion/modo";
import { type Fecha, hoy, sumarMeses } from "@/domain/fecha";
import { rangoDeDias, rangoDeMeses } from "@/domain/reportes/periodos";
import { ROLES_SOFTEAM_INFO } from "@/lib/roles";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import { listarCatalogoAseguradoras } from "@/server/modules/catalogo/aseguradoras";
import { listarEmisores } from "@/server/modules/catalogo/emisores";
import { listarMediosPago } from "@/server/modules/catalogo/medios-pago";
import { listarPaises } from "@/server/modules/catalogo/paises";
import { listarPaquetes } from "@/server/modules/catalogo/paquetes";
import { listarTickets } from "@/server/modules/catalogo/tickets";
import { listarClientes } from "@/server/modules/cuentas/consultas";
import { listarGrupos } from "@/server/modules/cuentas/grupos";
import { listarUsuariosSofteam } from "@/server/modules/cuentas/usuarios-softeam";
import { altasDeClientes, altasPorMes } from "@/server/modules/reportes/altas";
import {
  bonificacionesOtorgadas,
  consumiblesRenovados,
  pedidosSinSaldo,
  renovacionesPorMes,
  resumenTickets,
  seriesDeTickets,
  trimestresIniciales,
} from "@/server/modules/reportes/comerciales";
import {
  cobranzaPorMes,
  consumosPorEmpresa,
  consumosPorMes,
  empresasPorProducto,
  filtroDeCuentas,
  libroDeVentas,
  ordenesPendientes,
  vencimientos,
  ventasPorPaquete,
} from "@/server/modules/reportes/reportes";
import { listarOrdenes } from "@/server/modules/ventas/ordenes";
import { ETIQUETA_TIPO } from "../../medios-pago/tipos";
import { filtrosDeOrdenes } from "../../ordenes/filtros";

const ESTADOS_RENOVACION = {
  NO_RENOVAR: "No se renueva",
  SIN_ORDEN: "Sin orden de renovación",
  ORDEN_PENDIENTE: "Orden de renovación impaga",
  RENOVADO: "Renovado",
} as const;

const ESTADOS_ORDEN = { PEND_PAGO: "Pendiente", PAGADA: "Pagada", CANCELADA: "Cancelada" } as const;

const ORIGENES_ALTA = {
  EN_LINEA: "Registro en línea",
  SOFTEAM: "Alta de SOFTeam",
  IMPORTACION: "Importado",
} as const;

const USOS_TICKET: Record<string, string> = {
  UNICO_X_CLIENTE: "Una vez por cliente",
  UNICO_ABSOLUTO: "Una sola vez",
  MULTIPLE: "Varias veces",
};

const ESTADOS_SERIE = { VIGENTE: "Vigente", AGOTADA: "Tope agotado", VENCIDA: "Vencida" } as const;

/** Rango de un mes "AAAA-MM" (por defecto, el actual). */
function delMes(mes: string | null) {
  const elegido = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : hoy().slice(0, 7);
  const desde = `${elegido}-01` as Fecha;
  return { desde, hasta: sumarMeses(desde, 1) };
}

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
  // Grupo económico y país, en los reportes que los filtran.
  const filtro = filtroDeCuentas(p.get("grupo"), p.get("pais"));

  switch (p.get("reporte")) {
    case "cobranza":
      return respuestaCsv("cobranza por mes", await cobranzaPorMes(db, periodo.meses, filtro), [
        { titulo: "Mes", valor: (f) => f.mes },
        { titulo: "Órdenes emitidas", valor: (f) => f.ordenes },
        { titulo: "Emitido", valor: (f) => importeCsv(f.emitido) },
        { titulo: "Cobrado", valor: (f) => importeCsv(f.cobrado) },
        { titulo: "Pendiente", valor: (f) => importeCsv(f.pendiente) },
      ]);
    case "pendientes":
      return respuestaCsv("ordenes impagas", await ordenesPendientes(db, fecha, filtro), [
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
      return respuestaCsv(
        "vencimientos",
        await vencimientos(db, fecha, {
          proximosDias: [15, 30, 60, 90].includes(Number(p.get("dias")))
            ? Number(p.get("dias"))
            : 30,
          filtro,
        }),
        [
          { titulo: "Empresa", valor: (f) => f.empresa },
          { titulo: "N.º empresa", valor: (f) => f.empresaNumero },
          { titulo: "Paquete", valor: (f) => f.paquete },
          { titulo: "Unidades", valor: (f) => f.cantidad },
          { titulo: "Vence", valor: (f) => f.hasta },
          { titulo: "Días", valor: (f) => f.dias },
          { titulo: "Renovación", valor: (f) => ESTADOS_RENOVACION[f.estado] },
          { titulo: "Orden de renovación", valor: (f) => f.ordenRenovacion },
        ],
      );
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
      return respuestaCsv("empresas por producto", await empresasPorProducto(db, fecha, filtro), [
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
    case "altas":
      return respuestaCsv("altas de clientes", await altasDeClientes(db, periodo.rango, filtro), [
        { titulo: "Alta", valor: (f) => f.creadoEn },
        { titulo: "Número", valor: (f) => f.numero },
        { titulo: "Cliente", valor: (f) => f.nombre },
        { titulo: "CUIT", valor: (f) => formatearCuit(f.cuit) },
        { titulo: "Origen", valor: (f) => ORIGENES_ALTA[f.origen] },
        { titulo: "Grupo económico", valor: (f) => f.grupo },
        { titulo: "Países", valor: (f) => f.paises },
        { titulo: "Empresas", valor: (f) => f.empresas },
      ]);
    case "altas-mes": {
      const altas = await altasDeClientes(db, periodo.rango, filtro);
      return respuestaCsv("altas por mes", altasPorMes(periodo.meses, altas), [
        { titulo: "Mes", valor: (f) => f.mes },
        { titulo: "Clientes nuevos", valor: (f) => f.total },
        { titulo: ORIGENES_ALTA.EN_LINEA, valor: (f) => f.EN_LINEA },
        { titulo: ORIGENES_ALTA.SOFTEAM, valor: (f) => f.SOFTEAM },
        { titulo: ORIGENES_ALTA.IMPORTACION, valor: (f) => f.IMPORTACION },
      ]);
    }
    case "tickets":
      return respuestaCsv("tickets", await resumenTickets(db, periodo.rango), [
        { titulo: "Ticket", valor: (f) => f.codigo },
        { titulo: "Porcentaje", valor: (f) => importeCsv(f.porcentaje) },
        { titulo: "Tope", valor: (f) => (f.tope > 0n ? importeCsv(f.tope) : "Sin tope") },
        { titulo: "Compras", valor: (f) => f.usos },
        { titulo: "Renovaciones", valor: (f) => f.renovaciones },
        { titulo: "Descontado", valor: (f) => importeCsv(f.descontado) },
      ]);
    case "series-tickets":
      return respuestaCsv("saldo de tickets", await seriesDeTickets(db, periodo.rango, fecha), [
        { titulo: "Orden", valor: (f) => f.orden },
        { titulo: "Emitida", valor: (f) => f.emitidaEn },
        { titulo: "Cliente", valor: (f) => f.cliente },
        { titulo: "Ticket", valor: (f) => f.codigo },
        { titulo: "Renovaciones", valor: (f) => f.renovaciones },
        { titulo: "Descontado", valor: (f) => importeCsv(f.descontado) },
        { titulo: "Saldo", valor: (f) => (f.saldo === null ? "Sin tope" : importeCsv(f.saldo)) },
        { titulo: "Vence", valor: (f) => f.vence },
        { titulo: "Estado", valor: (f) => ESTADOS_SERIE[f.estado] },
      ]);
    case "bonificaciones":
      return respuestaCsv("bonificaciones", await bonificacionesOtorgadas(db, periodo.rango), [
        { titulo: "Orden", valor: (f) => f.orden },
        { titulo: "Emitida", valor: (f) => f.emitidaEn },
        { titulo: "Cliente", valor: (f) => f.cliente },
        { titulo: "Empresa", valor: (f) => f.empresa },
        { titulo: "Paquete", valor: (f) => f.paquete },
        { titulo: "Porcentaje", valor: (f) => importeCsv(f.porcentaje) },
        { titulo: "Recurrente", valor: (f) => (f.recurrente ? "Sí" : "No") },
        { titulo: "Motivo", valor: (f) => f.motivo },
        { titulo: "Otorgada por", valor: (f) => f.otorgadaPor },
        { titulo: "Bonificado", valor: (f) => importeCsv(f.bonificado) },
      ]);
    case "renovaciones":
      return respuestaCsv("renovaciones por mes", await renovacionesPorMes(db, periodo.meses), [
        { titulo: "Mes", valor: (f) => f.mes },
        { titulo: "Órdenes", valor: (f) => f.ordenes },
        { titulo: "Pagadas", valor: (f) => f.pagadas },
        { titulo: "Impagas", valor: (f) => f.impagas },
        { titulo: "Canceladas", valor: (f) => f.canceladas },
        { titulo: "Emitido", valor: (f) => importeCsv(f.emitido) },
        { titulo: "Cobrado", valor: (f) => importeCsv(f.cobrado) },
        { titulo: "Pendiente", valor: (f) => importeCsv(f.pendiente) },
        { titulo: "Días proporcionales", valor: (f) => f.diasProporcionales },
        { titulo: "Proporcional", valor: (f) => importeCsv(f.proporcional) },
      ]);
    case "trimestres":
      return respuestaCsv("trimestres iniciales", await trimestresIniciales(db, periodo.rango), [
        { titulo: "Cliente", valor: (f) => f.cliente },
        { titulo: "Empresa", valor: (f) => f.empresa },
        { titulo: "Paquete", valor: (f) => f.paquete },
        { titulo: "Vence", valor: (f) => f.hasta },
        {
          titulo: "Continuidad",
          valor: (f) =>
            f.renovacion !== null ? `Negociado (orden ${f.renovacion})` : "Falta negociar",
        },
      ]);
    case "sin-saldo":
      return respuestaCsv("pedidos sin saldo", await pedidosSinSaldo(db, delMes(p.get("mes"))), [
        { titulo: "Empresa", valor: (f) => f.empresa },
        { titulo: "Número de empresa", valor: (f) => f.empresaNumero },
        { titulo: "Familia", valor: (f) => f.familia },
        { titulo: "Parciales", valor: (f) => f.parciales },
        { titulo: "Sin saldo", valor: (f) => f.sinSaldo },
        { titulo: "Créditos pedidos", valor: (f) => f.solicitado },
        { titulo: "Créditos entregados", valor: (f) => f.entregado },
      ]);
    case "consumibles-renovados":
      return respuestaCsv(
        "consumibles renovados",
        await consumiblesRenovados(db, delMes(p.get("mes"))),
        [
          { titulo: "Fecha", valor: (f) => f.creadoEn },
          { titulo: "Empresa", valor: (f) => f.empresa },
          { titulo: "Paquete", valor: (f) => f.paquete },
          { titulo: "Cantidad", valor: (f) => f.cantidad },
          { titulo: "Orden", valor: (f) => f.orden ?? "Colectiva pendiente" },
          {
            titulo: "Estado de la orden",
            valor: (f) => (f.ordenEstado ? ESTADOS_ORDEN[f.ordenEstado] : ""),
          },
          { titulo: "Total", valor: (f) => (f.total === null ? "" : importeCsv(f.total)) },
        ],
      );
    case "ventas":
      return respuestaCsv("ventas por paquete", await ventasPorPaquete(db, periodo.rango, filtro), [
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
    case "medios-pago": {
      const [medios, paises] = await Promise.all([listarMediosPago(db), listarPaises(db)]);
      const pais = new Map(paises.map((x) => [x.id, x.nombre]));
      return respuestaCsv("medios de pago", medios, [
        { titulo: "Código", valor: (f) => f.codigo },
        { titulo: "Nombre", valor: (f) => f.nombre },
        { titulo: "Tipo", valor: (f) => ETIQUETA_TIPO[f.tipo] },
        { titulo: "País", valor: (f) => (f.paisId ? (pais.get(f.paisId) ?? f.paisId) : "Todos") },
        { titulo: "Ajuste %", valor: (f) => importeCsv(f.ajustePorcentaje) },
        { titulo: "Alta inicial", valor: (f) => f.habilitadoAlta },
        { titulo: "Adicionales", valor: (f) => f.habilitadoAdicional },
        { titulo: "Renovaciones", valor: (f) => f.habilitadoRenovacion },
        {
          titulo: "Modos de facturación",
          valor: (f) => f.modosFacturacion.map((m) => NOMBRE_MODO[m as ModoFacturacion]).join(", "),
        },
        { titulo: "Genera link", valor: (f) => f.generaLink },
        { titulo: "Factura al grupo", valor: (f) => f.planilla },
        { titulo: "Activo", valor: (f) => f.activo },
        { titulo: "Instrucciones", valor: (f) => f.instrucciones },
      ]);
    }
    case "emisores":
      await requerirSofteam(["ADMINISTRACION"]);
      // Las credenciales no se exportan: solo si están cargadas.
      return respuestaCsv("emisores", await listarEmisores(db), [
        { titulo: "Razón social", valor: (f) => f.razonSocial },
        { titulo: "CUIT", valor: (f) => formatearCuit(f.cuit) },
        { titulo: "Condición IVA", valor: (f) => f.condicionIva },
        { titulo: "Domicilio fiscal", valor: (f) => f.domicilioFiscal },
        { titulo: "País", valor: (f) => f.paisId },
        { titulo: "Punto de venta", valor: (f) => f.puntoVenta },
        { titulo: "Preferido del país", valor: (f) => f.preferido },
        { titulo: "Factura con Xubio", valor: (f) => f.xubio },
        { titulo: "Credenciales de Xubio", valor: (f) => f.xubioSecretoCargado },
        { titulo: "Cobra con Mercado Pago", valor: (f) => f.mercadoPago },
        { titulo: "Credenciales de Mercado Pago", valor: (f) => f.mpAccessTokenCargado },
        { titulo: "Activo", valor: (f) => f.activo },
      ]);
    case "grupos":
      return respuestaCsv("grupos economicos", await listarGrupos(db), [
        { titulo: "Grupo", valor: (f) => f.nombre },
        { titulo: "Nombre corto", valor: (f) => f.nombreCorto },
        { titulo: "Cliente principal", valor: (f) => f.principal },
        { titulo: "Factura a", valor: (f) => f.facturacion },
        { titulo: "Miembros", valor: (f) => f.miembros },
      ]);
    case "paises":
      return respuestaCsv("paises", await listarPaises(db), [
        { titulo: "Código", valor: (f) => f.id },
        { titulo: "País", valor: (f) => f.nombre },
        { titulo: "Nombre corto", valor: (f) => f.nombreCorto },
        { titulo: "Prefijo telefónico", valor: (f) => f.prefijoTelefonico },
        { titulo: "Moneda", valor: (f) => f.moneda },
        { titulo: "IVA general %", valor: (f) => importeCsv(f.alicuotaIvaGeneral) },
        { titulo: "Provincias", valor: (f) => f.provincias },
        { titulo: "Empresas", valor: (f) => f.empresas },
        { titulo: "Activo", valor: (f) => f.activo },
      ]);
    case "catalogo-tickets":
      await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
      return respuestaCsv("tickets", await listarTickets(db), [
        { titulo: "Código", valor: (f) => f.codigo },
        { titulo: "Descripción", valor: (f) => f.descripcion },
        { titulo: "Porcentaje", valor: (f) => importeCsv(f.porcentaje) },
        { titulo: "Tope", valor: (f) => importeCsv(f.tope) },
        { titulo: "Descontado", valor: (f) => importeCsv(f.descontado) },
        { titulo: "Mínimo de compra", valor: (f) => importeCsv(f.minimo) },
        { titulo: "Vigente desde", valor: (f) => f.vigenteDesde },
        { titulo: "Vigente hasta", valor: (f) => f.vigenteHasta },
        { titulo: "Uso", valor: (f) => USOS_TICKET[f.uso] ?? f.uso },
        { titulo: "Usos máximos", valor: (f) => f.usosMaximos || null },
        { titulo: "Usos", valor: (f) => f.usos },
        { titulo: "Público", valor: (f) => f.publico },
        { titulo: "Alta inicial", valor: (f) => f.altaInicial },
        { titulo: "Adicionales", valor: (f) => f.adicional },
        { titulo: "Renovaciones", valor: (f) => f.renovacion },
        { titulo: "País", valor: (f) => f.paisId },
        { titulo: "Cliente", valor: (f) => f.cliente },
        { titulo: "Paquetes", valor: (f) => f.paquetes.join(", ") },
        { titulo: "Activo", valor: (f) => f.activo },
        { titulo: "Observaciones", valor: (f) => f.observaciones },
      ]);
    case "usuarios":
      await requerirSofteam(["ADMINISTRACION"]);
      return respuestaCsv("usuarios softeam", await listarUsuariosSofteam(db), [
        { titulo: "Nombre", valor: (f) => f.nombre },
        { titulo: "Mail", valor: (f) => f.email },
        { titulo: "Rol", valor: (f) => (f.rol ? ROLES_SOFTEAM_INFO[f.rol].etiqueta : null) },
        { titulo: "Mail verificado", valor: (f) => f.verificado },
        { titulo: "Doble factor", valor: (f) => f.dosFactores },
        { titulo: "Alta", valor: (f) => f.desde },
        { titulo: "Último ingreso", valor: (f) => f.ultimoIngreso },
      ]);
    default:
      return new Response("Reporte inexistente", { status: 404 });
  }
}
