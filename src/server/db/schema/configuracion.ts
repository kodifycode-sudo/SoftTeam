import {
  boolean,
  char,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { canales, empresas, oficinas, paises } from "./cuentas";
import { condicionIva, rolProductor, tipoPersona } from "./enums";
import { marcasTiempo } from "./tipos";

/**
 * Persona que usa los productos de una empresa (colaborador o productor con
 * usuario). Puede además administrar la cuenta en STLic si tiene un rol de
 * administración y un usuario de login vinculado.
 */
export const colaboradores = pgTable(
  "colaboradores",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: varchar({ length: 120 }).notNull(),
    iniciales: varchar({ length: 5 }),
    email: varchar({ length: 160 }).notNull(),
    telefono: varchar({ length: 30 }),
    /** Alcance: sin canal ni oficina = toda la empresa; solo canal = el canal; oficina = esa oficina. */
    canalId: uuid().references(() => canales.id),
    oficinaId: uuid().references(() => oficinas.id),
    adminGeneral: boolean().notNull().default(false),
    /** Administra paquetes y pagos. */
    adminComercial: boolean().notNull().default(false),
    /** Administra la configuración. */
    adminOperativo: boolean().notNull().default(false),
    accesoProdigal: boolean().notNull().default(false),
    accesoCotiweb: boolean().notNull().default(false),
    accesoBienseguro: boolean().notNull().default(false),
    accesoBoletin: boolean().notNull().default(false),
    /** Código de usuario en Prodigal. */
    usuarioProdigal: varchar({ length: 20 }),
    /** Usuario de login en STLic (Better Auth), si administra la cuenta. */
    usuarioId: varchar({ length: 64 }),
    activo: boolean().notNull().default(true),
    altaFecha: date({ mode: "string" }).notNull().defaultNow(),
    bajaFecha: date({ mode: "string" }),
    ...marcasTiempo,
  },
  (t) => [
    uniqueIndex().on(t.empresaId, t.email),
    uniqueIndex().on(t.usuarioProdigal),
    index().on(t.usuarioId),
  ],
);

/** Catálogo de aseguradoras por país (lo mantiene SOFTeam). */
export const aseguradoras = pgTable(
  "aseguradoras",
  {
    id: uuid().primaryKey().defaultRandom(),
    paisId: char({ length: 2 })
      .notNull()
      .references(() => paises.id),
    /** Identificación legal en el país (código SSN en Argentina). */
    codigoLegal: varchar({ length: 10 }),
    nombre: varchar({ length: 80 }).notNull(),
    abreviatura: varchar({ length: 10 }).notNull(),
    interfazProdigalDisponible: boolean().notNull().default(false),
    interfazCotiwebDisponible: boolean().notNull().default(false),
    interfazDocumentosDisponible: boolean().notNull().default(false),
    activa: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [uniqueIndex().on(t.paisId, t.abreviatura)],
);

/** Aseguradoras con las que trabaja una empresa y sus interfaces activas. */
export const empresaAseguradoras = pgTable(
  "empresa_aseguradoras",
  {
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    aseguradoraId: uuid()
      .notNull()
      .references(() => aseguradoras.id),
    activa: boolean().notNull().default(true),
    interfazProdigal: boolean().notNull().default(false),
    interfazCotiweb: boolean().notNull().default(false),
    /** La baja de una interfaz rige desde el mes siguiente. */
    interfazBajaDesde: date({ mode: "string" }),
    ...marcasTiempo,
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.aseguradoraId] })],
);

/** Productor, organizador o subproductor de seguros de una empresa. */
export const productores = pgTable(
  "productores",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    oficinaId: uuid().references(() => oficinas.id),
    nombre: varchar({ length: 120 }).notNull(),
    matricula: varchar({ length: 20 }),
    tipoPersona: tipoPersona(),
    cuit: char({ length: 11 }),
    condicionIva: condicionIva(),
    email: varchar({ length: 160 }),
    telefono: varchar({ length: 30 }),
    celular: varchar({ length: 30 }),
    domicilio: varchar({ length: 160 }),
    agenteInstitorio: boolean().notNull().default(false),
    esProductor: boolean().notNull().default(true),
    esOrganizador: boolean().notNull().default(false),
    esSubproductor: boolean().notNull().default(false),
    activo: boolean().notNull().default(true),
    ...marcasTiempo,
  },
  (t) => [index().on(t.empresaId)],
);

/** Código del productor en cada aseguradora y su rol allí. */
export const productorCodigos = pgTable(
  "productor_codigos",
  {
    id: uuid().primaryKey().defaultRandom(),
    productorId: uuid()
      .notNull()
      .references(() => productores.id, { onDelete: "cascade" }),
    aseguradoraId: uuid()
      .notNull()
      .references(() => aseguradoras.id),
    codigo: varchar({ length: 20 }).notNull(),
    rol: rolProductor().notNull(),
    activo: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex().on(t.productorId, t.aseguradoraId, t.codigo)],
);

export interface Politicas {
  /** Las oficinas pueden enviar notificaciones a sus asegurados. */
  oficinasNotifican: boolean;
  /** Si una oficina agota lo suyo, usa el saldo de la empresa. */
  oficinasUsanPozoEmpresa: boolean;
  /** Tope mensual por oficina sobre el pozo de la empresa (`null` = sin tope). */
  topeMensualPozoPorOficina: number | null;
  /** Oficinas con administrador delegado pueden contratar sus propios paquetes. */
  oficinasContratan: boolean;
}

export const POLITICAS_POR_DEFECTO: Politicas = {
  oficinasNotifican: true,
  oficinasUsanPozoEmpresa: true,
  topeMensualPozoPorOficina: 500,
  oficinasContratan: true,
};

export const politicasEmpresa = pgTable("politicas_empresa", {
  empresaId: uuid()
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  politicas: jsonb().$type<Politicas>().notNull(),
  ...marcasTiempo,
});
