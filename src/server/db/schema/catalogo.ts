import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { paises } from "./cuentas";
import { agregacionRecurso, claseRecurso, tipoMedioPago, tipoPaquete } from "./enums";
import { dinero, fechaCol, marcasTiempo, pct } from "./tipos";

/** Producto de SOFTeam: prodigal, cotiweb, bienseguro, boletin, notificaciones. */
export const productos = pgTable("productos", {
  id: varchar({ length: 30 }).primaryKey(),
  nombre: varchar({ length: 60 }).notNull(),
  orden: smallint().notNull().default(0),
  activo: boolean().notNull().default(true),
});

/** Límite licenciable ("prodigal.usuarios"). Agregar uno es un alta de datos, no de esquema. */
export const recursos = pgTable("recursos", {
  id: varchar({ length: 60 }).primaryKey(),
  productoId: varchar({ length: 30 })
    .notNull()
    .references(() => productos.id),
  nombre: varchar({ length: 80 }).notNull(),
  clase: claseRecurso().notNull(),
  /** Cómo se acumula entre contratos y unidades (retención de cartera: máximo). */
  agregacion: agregacionRecurso().notNull().default("SUMA"),
  unidad: varchar({ length: 20 }),
  orden: smallint().notNull().default(0),
  activo: boolean().notNull().default(true),
});

/** Paquete comercial del catálogo, por país. */
export const paquetes = pgTable(
  "paquetes",
  {
    id: uuid().primaryKey().defaultRandom(),
    codigo: varchar({ length: 20 }).notNull().unique(),
    nombre: varchar({ length: 80 }).notNull(),
    descripcion: text(),
    paisId: char({ length: 2 })
      .notNull()
      .references(() => paises.id),
    tipo: tipoPaquete().notNull(),
    /** Solo visible y vendible para roles SOFTeam. */
    privado: boolean().notNull().default(false),
    /** Recomendado: el catálogo del cliente lo muestra primero y resaltado. */
    destacado: boolean().notNull().default(false),
    activo: boolean().notNull().default(true),
    ventaDesde: fechaCol().notNull(),
    ventaHasta: fechaCol(),
    ...marcasTiempo,
  },
  (t) => [
    index().on(t.paisId, t.activo),
    check("venta_rango", sql`${t.ventaHasta} is null or ${t.ventaHasta} >= ${t.ventaDesde}`),
  ],
);

export const paqueteRecursos = pgTable(
  "paquete_recursos",
  {
    paqueteId: uuid()
      .notNull()
      .references(() => paquetes.id, { onDelete: "cascade" }),
    recursoId: varchar({ length: 60 })
      .notNull()
      .references(() => recursos.id),
    cantidad: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.paqueteId, t.recursoId] }),
    check("cantidad_no_negativa", sql`${t.cantidad} >= 0`),
  ],
);

/** Variante de precio y duración de un paquete (mensual, anual, pago único). */
export const alternativas = pgTable(
  "alternativas",
  {
    id: uuid().primaryKey().defaultRandom(),
    paqueteId: uuid()
      .notNull()
      .references(() => paquetes.id, { onDelete: "cascade" }),
    nombre: varchar({ length: 40 }).notNull(),
    /** Duración en meses. `null` para consumibles (no vencen por fecha). */
    meses: smallint(),
    precioCompra: dinero().notNull(),
    precioRenovacion: dinero().notNull(),
    orden: smallint().notNull().default(0),
    activa: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [
    index().on(t.paqueteId),
    check("meses_positivos", sql`${t.meses} is null or ${t.meses} > 0`),
    check("precios_no_negativos", sql`${t.precioCompra} >= 0 and ${t.precioRenovacion} >= 0`),
  ],
);

export const mediosPago = pgTable(
  "medios_pago",
  {
    id: uuid().primaryKey().defaultRandom(),
    codigo: varchar({ length: 20 }).notNull().unique(),
    nombre: varchar({ length: 60 }).notNull(),
    tipo: tipoMedioPago().notNull(),
    /** `null`: disponible en todos los países. */
    paisId: char({ length: 2 }).references(() => paises.id),
    /** Positivo = recargo, negativo = bonificación. */
    ajustePorcentaje: pct().notNull().default(sql`0`),
    habilitadoAlta: boolean().notNull().default(true),
    habilitadoAdicional: boolean().notNull().default(true),
    habilitadoRenovacion: boolean().notNull().default(true),
    generaLink: boolean().notNull().default(false),
    planilla: boolean().notNull().default(false),
    /** Instrucciones al cliente cuando el medio no genera link (datos bancarios, etc.). */
    instrucciones: text(),
    orden: smallint().notNull().default(0),
    activo: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [
    check("ajuste_rango", sql`${t.ajustePorcentaje} > -100 and ${t.ajustePorcentaje} <= 100`),
  ],
);

/** Ticket de descuento: porcentaje con tope total que funciona como saldo. */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid().primaryKey().defaultRandom(),
    codigo: varchar({ length: 20 }).notNull().unique(),
    descripcion: varchar({ length: 200 }),
    porcentaje: pct().notNull(),
    tope: dinero().notNull(),
    vigenteDesde: fechaCol().notNull(),
    vigenteHasta: fechaCol().notNull(),
    activo: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [
    check("porcentaje_rango", sql`${t.porcentaje} > 0 and ${t.porcentaje} <= 100`),
    check("vigencia_rango", sql`${t.vigenteHasta} >= ${t.vigenteDesde}`),
  ],
);

/** Paquetes a los que se restringe un ticket. Sin filas: aplica a todos. */
export const ticketPaquetes = pgTable(
  "ticket_paquetes",
  {
    ticketId: uuid()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    paqueteId: uuid()
      .notNull()
      .references(() => paquetes.id),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.paqueteId] })],
);

/** Medio de envío de notificaciones y su factor de consumo (mail 1, WhatsApp 2,5). */
export const mediosEnvio = pgTable(
  "medios_envio",
  {
    id: varchar({ length: 20 }).primaryKey(),
    nombre: varchar({ length: 40 }).notNull(),
    factorCentesimos: integer().notNull(),
    activo: boolean().notNull().default(true),
  },
  (t) => [check("factor_positivo", sql`${t.factorCentesimos} > 0`)],
);
