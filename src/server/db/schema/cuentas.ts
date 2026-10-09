import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { mediosPago } from "./catalogo";
import { tipoInstalacion, tipoPersona } from "./enums";
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

/** Moneda (`STLicMonedas` de SOFTeam) con su cotización en pesos. */
export const monedas = pgTable(
  "monedas",
  {
    /** ISO 4217 ("ARS"). */
    codigo: char({ length: 3 }).primaryKey(),
    nombre: varchar({ length: 40 }).notNull(),
    simbolo: varchar({ length: 5 }).notNull(),
    /** Pesos argentinos por unidad (el peso vale 1). `null`: sin cotización cargada. */
    cotizacion: numeric({ precision: 18, scale: 6 }),
    cotizacionEn: instante(),
    activa: boolean().notNull().default(true),
  },
  (t) => [check("cotizacion_positiva", sql`${t.cotizacion} is null or ${t.cotizacion} > 0`)],
);

/** País: define moneda, alícuota general de IVA y el catálogo de paquetes y aseguradoras. */
export const paises = pgTable("paises", {
  /** ISO 3166-1 alfa-2 ("AR"). */
  id: char({ length: 2 }).primaryKey(),
  nombre: varchar({ length: 60 }).notNull(),
  nombreCorto: varchar({ length: 20 }),
  /** Código telefónico internacional ("54"). */
  prefijoTelefonico: varchar({ length: 5 }).notNull(),
  moneda: char({ length: 3 })
    .notNull()
    .references(() => monedas.codigo),
  alicuotaIvaGeneral: pct().notNull(),
  activo: boolean().notNull().default(true),
});

/** Provincia o estado de un país (`STLicProvincias`). Los domicilios guardan su nombre. */
export const provincias = pgTable(
  "provincias",
  {
    id: uuid().primaryKey().defaultRandom(),
    paisId: char({ length: 2 })
      .notNull()
      .references(() => paises.id),
    /** Código corto (ISO 3166-2 sin el país: "B", "C", "X"). */
    codigo: varchar({ length: 5 }).notNull(),
    nombre: varchar({ length: 60 }).notNull(),
    activa: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex().on(t.paisId, t.codigo), uniqueIndex().on(t.paisId, t.nombre)],
);

/**
 * Condición frente al IVA del receptor (`STLicIVACondiciones`). Alícuota,
 * comprobante y código ARCA son datos que edita Administración: el cálculo de
 * la orden los toma de acá. Se dan de baja, no se borran (las órdenes guardan
 * el código).
 */
export const condicionesIva = pgTable(
  "condiciones_iva",
  {
    codigo: varchar({ length: 30 }).primaryKey(),
    paisId: char({ length: 2 })
      .notNull()
      .references(() => paises.id),
    nombre: varchar({ length: 60 }).notNull(),
    /** Condición del receptor según ARCA. No es única: monotributo con A y con B comparten el 6. */
    codigoArca: smallint().notNull(),
    alicuota: pct().notNull(),
    /** A discrimina el IVA; B lo incluye; E (exterior) todavía no se emite. */
    comprobante: char({ length: 1 }).$type<"A" | "B" | "E">().notNull(),
    activa: boolean().notNull().default(true),
    orden: smallint().notNull().default(0),
  },
  (t) => [
    uniqueIndex().on(t.paisId, t.nombre),
    check("comprobante_valido", sql`${t.comprobante} in ('A', 'B', 'E')`),
    check("alicuota_rango", sql`${t.alicuota} >= 0 and ${t.alicuota} <= 100`),
  ],
);

/**
 * Sociedad de SOFTeam que factura: cada cliente tiene un
 * emisor y la orden lo congela. Cada emisor tiene su propia conexión con Xubio
 * y con Mercado Pago; los secretos se guardan cifrados (AES-256-GCM).
 */
export const emisores = pgTable(
  "emisores",
  {
    id: uuid().primaryKey().defaultRandom(),
    razonSocial: varchar({ length: 120 }).notNull(),
    cuit: char({ length: 11 }).notNull(),
    /** Responsable Inscripto o Gran Contribuyente: emite comprobantes A y B. */
    condicionIva: varchar({ length: 30 })
      .notNull()
      .references(() => condicionesIva.codigo),
    domicilioFiscal: varchar({ length: 160 }).notNull(),
    paisId: char({ length: 2 })
      .notNull()
      .references(() => paises.id),
    /** Punto de venta de ARCA. */
    puntoVenta: smallint(),
    /** El que se propone al crear un cliente del país (a lo sumo uno por país). */
    preferido: boolean().notNull().default(false),
    activo: boolean().notNull().default(true),
    /** Con Xubio la factura se emite sola; sin Xubio, Administración la registra a mano. */
    xubio: boolean().notNull().default(false),
    xubioClientId: varchar({ length: 100 }),
    xubioSecretoCifrado: text(),
    /** Punto de venta electrónico de la cuenta de Xubio (su id interno). */
    xubioPuntoVentaId: integer(),
    xubioProductoId: integer(),
    xubioCentroCostoId: integer(),
    /** Sin Mercado Pago no se ofrecen el link de pago ni la suscripción. */
    mercadoPago: boolean().notNull().default(false),
    mpAccessTokenCifrado: text(),
    mpSecretoAvisosCifrado: text(),
    ...marcasTiempo,
  },
  (t) => [
    uniqueIndex().on(t.cuit),
    uniqueIndex("emisor_preferido_por_pais")
      .on(t.paisId)
      .where(sql`${t.preferido} and ${t.activo}`),
  ],
);

export const gruposEconomicos = pgTable("grupos_economicos", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: varchar({ length: 80 }).notNull(),
  nombreCorto: varchar({ length: 20 }).notNull().unique(),
  /**
   * Cliente al que se factura cuando la orden usa un medio de planilla
   * (aseguradoras distribuidoras). `null` = sin facturación consolidada.
   */
  clienteFacturacionId: uuid().references((): AnyPgColumn => clientes.id),
  /** Cliente que encabeza el grupo (organización y reportes). */
  clientePrincipalId: uuid().references((): AnyPgColumn => clientes.id),
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
    condicionIva: varchar({ length: 30 })
      .notNull()
      .references(() => condicionesIva.codigo),
    domicilioFiscal: jsonb().$type<Domicilio>().notNull(),
    domicilioComercial: jsonb().$type<Domicilio>(),
    contactoAdministrador: jsonb().$type<Contacto>().notNull(),
    contactoPagos: jsonb().$type<Contacto>(),
    contactoComercial: jsonb().$type<Contacto>(),
    grupoId: uuid().references(() => gruposEconomicos.id),
    medioPagoAltaId: uuid().references((): AnyPgColumn => mediosPago.id),
    medioPagoRenovacionId: uuid().references((): AnyPgColumn => mediosPago.id),
    /**
     * Modo de facturación: 0 pago directo, 1 factura
     * adelantada, 2 suscripción de Mercado Pago, 3 factura agrupada. Define el
     * estado inicial de los paquetes, la tolerancia de pago y los medios.
     */
    modoFacturacion: smallint().notNull().default(0),
    /** Sociedad que le factura. `null`: el emisor preferido de su país. */
    emisorId: uuid().references(() => emisores.id),
    xubioId: varchar({ length: 40 }),
    observaciones: text(),
    /** Observación fija que se imprime en sus comprobantes. */
    observacionFactura: varchar({ length: 200 }),
    activo: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [
    uniqueIndex().on(t.numero),
    uniqueIndex().on(t.cuit),
    index().on(t.grupoId),
    check("modo_facturacion_valido", sql`${t.modoFacturacion} between 0 and 3`),
  ],
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
    tipoInstalacion: tipoInstalacion().notNull().default("SAAS"),
    activa: boolean().notNull().default(true),
    /** Cambia con cualquier modificación de la empresa o sus datos: dispara la sincronización. */
    modificadaEn: instante().notNull().defaultNow(),
    /**
     * Notas de SOFTeam sobre la empresa. Las líneas que empiezan con "*" son
     * internas: solo las ve SOFTeam.
     */
    notasInternas: text(),
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
    /**
     * Compra delegada: cliente al que se facturan las compras de la oficina
     * (lo asigna SOFTeam). `null`: al cliente de la empresa.
     */
    clienteFacturacionId: uuid().references(() => clientes.id),
    /** Envía notificaciones a sus asegurados (si la política de la empresa lo permite). */
    notifica: boolean().notNull().default(true),
    activa: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [uniqueIndex().on(t.canalId, t.codigo), index().on(t.empresaId)],
);
