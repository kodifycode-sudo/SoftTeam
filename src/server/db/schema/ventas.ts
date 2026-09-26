import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { usuarios } from "./auth";
import { alternativas, mediosPago, paquetes, recursos, tickets } from "./catalogo";
import { clientes, empresas, oficinas } from "./cuentas";
import {
  claseRecurso,
  condicionIva,
  estadoContrato,
  estadoOrden,
  tipoAccion,
  tipoComprobante,
  tipoGeneracion,
  tipoPaquete,
} from "./enums";
import { dinero, fechaCol, instante, marcasTiempo, pct } from "./tipos";

/** Carrito persistente por empresa. Los contratos recién existen al confirmar la orden. */
export const carritoItems = pgTable(
  "carrito_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    /** Compra delegada de una oficina. `null`: para toda la empresa. */
    oficinaId: uuid().references(() => oficinas.id),
    alternativaId: uuid()
      .notNull()
      .references(() => alternativas.id),
    tipoAccion: tipoAccion().notNull().default("ALTA"),
    /** Para RENOVACION: contrato que se renueva. */
    contratoAnteriorId: uuid().references((): AnyPgColumn => contratos.id),
    cantidad: smallint().notNull().default(1),
    agregadoPor: text().references(() => usuarios.id, { onDelete: "set null" }),
    ...marcasTiempo,
  },
  (t) => [
    index().on(t.empresaId),
    check("cantidad_positiva", sql`${t.cantidad} between 1 and 999`),
  ],
);

/**
 * Orden: agrupa contratos en un único cobro. Congela todos los importes
 * calculados. Una orden agrupada (planilla) puede incluir varias empresas y no
 * tiene `empresaId`.
 */
export const ordenes = pgTable(
  "ordenes",
  {
    id: uuid().primaryKey().defaultRandom(),
    numero: integer().notNull().generatedAlwaysAsIdentity({ startWith: 10000 }),
    empresaId: uuid().references(() => empresas.id),
    clienteId: uuid()
      .notNull()
      .references(() => clientes.id),
    clienteFacturacionId: uuid()
      .notNull()
      .references(() => clientes.id),
    medioPagoId: uuid()
      .notNull()
      .references(() => mediosPago.id),
    estado: estadoOrden().notNull().default("PEND_PAGO"),
    tipoGeneracion: tipoGeneracion().notNull().default("MANUAL"),
    /** Orden que inició la serie de renovaciones. */
    ordenOrigenId: uuid().references((): AnyPgColumn => ordenes.id),
    agrupada: boolean().notNull().default(false),
    /** Período de planilla ("2026-10") para órdenes agrupadas. */
    periodo: char({ length: 7 }),
    moneda: char({ length: 3 }).notNull(),
    condicionIva: condicionIva().notNull(),
    tipoComprobante: tipoComprobante().notNull(),
    // Cascada congelada
    subtotalLista: dinero().notNull(),
    bonificacionTotal: dinero().notNull(),
    subtotal: dinero().notNull(),
    ticketId: uuid().references(() => tickets.id),
    ticketPorcentaje: pct().notNull().default(sql`0`),
    ticketDescuento: dinero().notNull().default(sql`0`),
    baseNeta: dinero().notNull(),
    ajustePagoPorcentaje: pct().notNull(),
    ajustePago: dinero().notNull(),
    netoGravado: dinero().notNull(),
    alicuotaIva: pct().notNull(),
    iva: dinero().notNull(),
    total: dinero().notNull(),
    // Ciclo de cobro
    emitidaEn: instante().notNull().defaultNow(),
    pagadaEn: instante(),
    canceladaEn: instante(),
    pagoError: boolean().notNull().default(false),
    pagoErrorDetalle: varchar({ length: 300 }),
    pagoErrorEn: instante(),
    linkReenvios: smallint().notNull().default(0),
    mpPreferenciaId: varchar({ length: 80 }),
    /** Link de pago vigente de la orden (se reutiliza hasta que se paga). */
    linkPagoUrl: text(),
    mpSuscripcionId: varchar({ length: 80 }),
    mpPagoId: text(),
    xubioComprobanteId: varchar({ length: 80 }),
    /** Número del comprobante ("A 0001-00000123"). */
    facturaNumero: varchar({ length: 40 }),
    /** Reserva de la emisión: evita facturar dos veces si dos procesos coinciden. */
    facturacionIniciadaEn: instante(),
    facturadaEn: instante(),
    /** Evita duplicar la orden ante un doble envío del checkout o una reejecución. */
    claveIdempotencia: varchar({ length: 80 }),
    /** Marcada para revisión manual (p. ej. suscripción no regenerada tras cambiar fechas). */
    requiereRevision: boolean().notNull().default(false),
    observaciones: text(),
    /** Control de concurrencia optimista para ediciones de Administración. */
    version: integer().notNull().default(1),
    ...marcasTiempo,
  },
  (t) => [
    uniqueIndex().on(t.numero),
    uniqueIndex().on(t.claveIdempotencia),
    index().on(t.empresaId, t.estado),
    index().on(t.clienteFacturacionId, t.estado),
    index().on(t.estado, t.emitidaEn),
    check("agrupada_sin_empresa", sql`not ${t.agrupada} or ${t.empresaId} is null`),
    check("total_no_negativo", sql`${t.total} >= 0`),
  ],
);

/**
 * Contrato: un paquete contratado por una empresa. Los límites y el precio se
 * congelan al crearlo. Solo `hasta` puede editarse después (consolidación de
 * vencimientos, con motivo y auditoría).
 */
export const contratos = pgTable(
  "contratos",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    /** Asignación a una oficina (consumos y compra delegada). `null`: toda la empresa. */
    oficinaId: uuid().references(() => oficinas.id),
    paqueteId: uuid()
      .notNull()
      .references(() => paquetes.id),
    alternativaId: uuid()
      .notNull()
      .references(() => alternativas.id),
    ordenId: uuid()
      .notNull()
      .references(() => ordenes.id),
    contratoAnteriorId: uuid().references((): AnyPgColumn => contratos.id),
    tipoAccion: tipoAccion().notNull(),
    tipoPaquete: tipoPaquete().notNull(),
    cantidad: smallint().notNull(),
    meses: smallint(),
    estado: estadoContrato().notNull(),
    desde: fechaCol(),
    hasta: fechaCol(),
    /** Límite de la excepción de pago. `null` con estado PEND_PAGO_ACTIVO = sin límite. */
    pendPagoActivoHasta: fechaCol(),
    precioLista: dinero().notNull(),
    bonifPorcentaje: pct().notNull().default(sql`0`),
    bonifRecurrente: boolean().notNull().default(false),
    bonifMotivo: varchar({ length: 200 }),
    precioFinal: dinero().notNull(),
    /** No renovar automáticamente ni enviar avisos de vencimiento. */
    noRenovar: boolean().notNull().default(false),
    activadoEn: instante(),
    observaciones: text(),
    ...marcasTiempo,
  },
  (t) => [
    index().on(t.empresaId, t.estado),
    index().on(t.ordenId),
    index().on(t.hasta),
    uniqueIndex("contratos_renovacion_unica")
      .on(t.contratoAnteriorId)
      .where(sql`${t.estado} <> 'CANCELADO'`),
    check(
      "periodo_valido",
      sql`${t.hasta} is null or ${t.desde} is null or ${t.hasta} >= ${t.desde}`,
    ),
    check("cantidad_positiva", sql`${t.cantidad} >= 1`),
    check("bonif_rango", sql`${t.bonifPorcentaje} >= 0 and ${t.bonifPorcentaje} <= 100`),
    check(
      "consumible_sin_vencimiento",
      sql`${t.tipoPaquete} = 'TEMPORAL' or (${t.meses} is null and ${t.hasta} is null)`,
    ),
  ],
);

/** Límites congelados del contrato: cantidad del paquete × unidades contratadas. */
export const contratoRecursos = pgTable(
  "contrato_recursos",
  {
    contratoId: uuid()
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    recursoId: varchar({ length: 60 })
      .notNull()
      .references(() => recursos.id),
    clase: claseRecurso().notNull(),
    cantidad: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contratoId, t.recursoId] }),
    check("cantidad_no_negativa", sql`${t.cantidad} >= 0`),
  ],
);

/** Línea de la orden: importes congelados y total prorrateado de cada contrato. */
export const ordenItems = pgTable(
  "orden_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    ordenId: uuid()
      .notNull()
      .references(() => ordenes.id, { onDelete: "cascade" }),
    contratoId: uuid()
      .notNull()
      .unique()
      .references(() => contratos.id),
    descripcion: varchar({ length: 160 }).notNull(),
    precioLista: dinero().notNull(),
    bonificacion: dinero().notNull(),
    precioFinal: dinero().notNull(),
    totalProrrateado: dinero().notNull(),
  },
  (t) => [index().on(t.ordenId)],
);
