import {
  type AnyPgColumn,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { mediosPago } from "./catalogo";
import { condicionIva, tipoCliente, tipoInstalacion, tipoPersona } from "./enums";
import { instante, marcasTiempo, pct } from "./tipos";

export interface Domicilio {
  calle: string;
  ciudad: string;
  codigoPostal: string;
  provincia: string;
  paisId: string;
}

export interface Contacto {
  nombre: string;
  email: string | null;
  telefono: string | null;
}

/** País: define moneda, alícuota general de IVA y el catálogo de paquetes y aseguradoras. */
export const paises = pgTable("paises", {
  /** ISO 3166-1 alfa-2 ("AR"). */
  id: char({ length: 2 }).primaryKey(),
  nombre: varchar({ length: 60 }).notNull(),
  /** Código telefónico internacional ("54"). */
  prefijoTelefonico: varchar({ length: 5 }).notNull(),
  /** ISO 4217 ("ARS"). */
  moneda: char({ length: 3 }).notNull(),
  alicuotaIvaGeneral: pct().notNull(),
  activo: boolean().notNull().default(true),
});

export const gruposEconomicos = pgTable("grupos_economicos", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: varchar({ length: 80 }).notNull(),
  nombreCorto: varchar({ length: 20 }).notNull().unique(),
  /**
   * Cliente al que se factura cuando la orden usa un medio de planilla
   * (aseguradoras distribuidoras). `null` = sin facturación consolidada.
   */
  clienteFacturacionId: uuid().references((): AnyPgColumn => clientes.id),
  ...marcasTiempo,
});

/** Entidad comercial que contrata y paga: datos fiscales y contactos. */
export const clientes = pgTable(
  "clientes",
  {
    id: uuid().primaryKey().defaultRandom(),
    numero: integer().notNull().generatedAlwaysAsIdentity({ startWith: 1000 }),
    tipoPersona: tipoPersona().notNull(),
    /** Titular (persona física) o denominación (persona jurídica). */
    nombre: varchar({ length: 120 }).notNull(),
    tipoSociedad: varchar({ length: 10 }),
    nombreFactura: varchar({ length: 120 }).notNull(),
    cuit: char({ length: 11 }).notNull(),
    condicionIva: condicionIva().notNull(),
    domicilioFiscal: jsonb().$type<Domicilio>().notNull(),
    domicilioComercial: jsonb().$type<Domicilio>(),
    contactoAdministrador: jsonb().$type<Contacto>().notNull(),
    contactoPagos: jsonb().$type<Contacto>(),
    contactoComercial: jsonb().$type<Contacto>(),
    grupoId: uuid().references(() => gruposEconomicos.id),
    medioPagoAltaId: uuid().references((): AnyPgColumn => mediosPago.id),
    medioPagoRenovacionId: uuid().references((): AnyPgColumn => mediosPago.id),
    xubioId: varchar({ length: 40 }),
    observaciones: text(),
    /** Observación fija que se imprime en sus comprobantes. */
    observacionFactura: varchar({ length: 200 }),
    activo: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [uniqueIndex().on(t.numero), uniqueIndex().on(t.cuit), index().on(t.grupoId)],
);

/**
 * Instalación del sistema de un cliente: la unidad que se licencia. Su
 * `numero` es el identificador que usan los productos.
 */
export const empresas = pgTable(
  "empresas",
  {
    id: uuid().primaryKey().defaultRandom(),
    numero: integer().notNull().generatedAlwaysAsIdentity({ startWith: 2000 }),
    clienteId: uuid()
      .notNull()
      .references(() => clientes.id),
    nombre: varchar({ length: 120 }).notNull(),
    nombreCorto: varchar({ length: 20 }).notNull(),
    paisId: char({ length: 2 })
      .notNull()
      .references(() => paises.id),
    tipoCliente: tipoCliente().notNull().default("DIRECTO"),
    tipoInstalacion: tipoInstalacion().notNull().default("SAAS"),
    activa: boolean().notNull().default(true),
    /** Cambia con cualquier modificación de la empresa o sus datos: dispara la sincronización. */
    modificadaEn: instante().notNull().defaultNow(),
    ...marcasTiempo,
  },
  (t) => [uniqueIndex().on(t.numero), index().on(t.clienteId), index().on(t.modificadaEn)],
);

/** Canal comercial: agrupa oficinas (los dos primeros dígitos del código de oficina). */
export const canales = pgTable(
  "canales",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    codigo: char({ length: 2 }).notNull(),
    nombre: varchar({ length: 60 }).notNull(),
    activo: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex().on(t.empresaId, t.codigo)],
);

/**
 * Oficina o punto de venta: código CC-OOO (canal + oficina). Toda empresa
 * tiene al menos la 01-001, creada con el alta.
 */
export const oficinas = pgTable(
  "oficinas",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    canalId: uuid()
      .notNull()
      .references(() => canales.id),
    codigo: char({ length: 3 }).notNull(),
    nombre: varchar({ length: 80 }).notNull(),
    telefono: varchar({ length: 30 }),
    whatsapp: varchar({ length: 30 }),
    domicilio: varchar({ length: 160 }),
    redes: jsonb().$type<Partial<Record<"web" | "facebook" | "instagram" | "linkedin", string>>>(),
    activa: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [uniqueIndex().on(t.canalId, t.codigo), index().on(t.empresaId)],
);
