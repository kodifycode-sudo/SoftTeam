import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { usuarios } from "./auth";
import { consumos } from "./consumos";
import { canales, empresas, oficinas } from "./cuentas";
import { estadoIncidente, prioridadIncidente } from "./enums";
import { instante, marcasTiempo } from "./tipos";

/**
 * Pedido de asistencia de una empresa a Soporte SOFTeam ("tickets de
 * soporte"). Abrir uno consume un crédito de soporte de la licencia.
 */
export const incidentes = pgTable(
  "incidentes",
  {
    id: uuid().primaryKey().defaultRandom(),
    numero: integer().notNull().generatedAlwaysAsIdentity({ startWith: 1000 }),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    creadoPorId: text()
      .notNull()
      .references(() => usuarios.id),
    /**
     * Alcance de quien lo abrió (administrador delegado): lo ven los que
     * administran ese canal u oficina. Sin canal ni oficina, toda la empresa.
     */
    canalId: uuid().references(() => canales.id),
    oficinaId: uuid().references(() => oficinas.id),
    /** Producto sobre el que consulta ("prodigal", "cotiweb"… o "stlic"). */
    producto: varchar({ length: 20 }).notNull(),
    asunto: varchar({ length: 140 }).notNull(),
    prioridad: prioridadIncidente().notNull().default("MEDIA"),
    estado: estadoIncidente().notNull().default("ABIERTO"),
    /** Persona de Soporte que lo atiende. */
    asignadoAId: text().references(() => usuarios.id, { onDelete: "set null" }),
    /** Crédito de soporte consumido al abrirlo. */
    consumoId: uuid().references(() => consumos.id),
    ultimaActividadEn: instante().notNull().defaultNow(),
    resueltoEn: instante(),
    ...marcasTiempo,
  },
  (t) => [
    index().on(t.empresaId, t.estado),
    index().on(t.estado, t.ultimaActividadEn),
    index().on(t.numero),
  ],
);

export const incidenteMensajes = pgTable(
  "incidente_mensajes",
  {
    id: uuid().primaryKey().defaultRandom(),
    incidenteId: uuid()
      .notNull()
      .references(() => incidentes.id, { onDelete: "cascade" }),
    autorId: text()
      .notNull()
      .references(() => usuarios.id),
    deSofteam: boolean().notNull(),
    /** Nota interna de SOFTeam: el cliente no la ve. */
    interno: boolean().notNull().default(false),
    texto: text().notNull(),
    creadoEn: instante().notNull().defaultNow(),
  },
  (t) => [index().on(t.incidenteId, t.creadoEn)],
);

/** Contenido binario (imágenes chicas, como el logo de la marca). */
const binario = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (valor) => Buffer.from(valor),
});

/**
 * Marca blanca: cómo se muestra la empresa ante sus asegurados en los
 * productos (BienSeguro, Boletín, notificaciones). Los productos la leen por
 * la API.
 */
export const marcasEmpresa = pgTable("marcas_empresa", {
  empresaId: uuid()
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  nombreComercial: varchar({ length: 80 }),
  eslogan: varchar({ length: 120 }),
  colorPrimario: varchar({ length: 7 }),
  colorSecundario: varchar({ length: 7 }),
  logo: binario(),
  logoTipo: varchar({ length: 30 }),
  /** Hash del logo: permite a los productos cachearlo y detectar cambios. */
  logoHash: varchar({ length: 64 }),
  textoBienvenida: varchar({ length: 500 }),
  firmaMail: varchar({ length: 300 }),
  web: varchar({ length: 160 }),
  email: varchar({ length: 160 }),
  telefono: varchar({ length: 30 }),
  whatsapp: varchar({ length: 30 }),
  ...marcasTiempo,
});
