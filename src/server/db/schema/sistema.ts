import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { empresas } from "./cuentas";
import { estadoAlerta, estadoEvento, estadoJob, tipoAlerta } from "./enums";
import { instante, marcasTiempo } from "./tipos";
import { contratos, ordenes } from "./ventas";

/** Parámetros del sistema editables sin deploy (días de corte, semáforo, umbrales). */
export const parametros = pgTable("parametros", {
  clave: varchar({ length: 60 }).primaryKey(),
  valor: jsonb().notNull(),
  descripcion: varchar({ length: 300 }).notNull(),
  ...marcasTiempo,
});

/**
 * Alertas. `claveDeduplicacion` impide repetir la misma alerta (por ejemplo,
 * VENCIMIENTO_7D de un contrato se genera una sola vez).
 */
export const alertas = pgTable(
  "alertas",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid().references(() => empresas.id),
    contratoId: uuid().references(() => contratos.id),
    ordenId: uuid().references(() => ordenes.id),
    tipo: tipoAlerta().notNull(),
    claveDeduplicacion: varchar({ length: 160 }).notNull(),
    mensaje: varchar({ length: 300 }).notNull(),
    paraCliente: boolean().notNull().default(true),
    paraSofteam: boolean().notNull().default(true),
    estado: estadoAlerta().notNull().default("PENDIENTE"),
    generadaEn: instante().notNull().defaultNow(),
    enviadaEn: instante(),
    leidaEn: instante(),
    error: varchar({ length: 300 }),
  },
  (t) => [uniqueIndex().on(t.claveDeduplicacion), index().on(t.empresaId, t.estado)],
);

/** Registro de corridas de procesos programados. (job, clave) único = idempotencia. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    job: varchar({ length: 40 }).notNull(),
    /** Fecha o período de la corrida ("2026-09-25", "2026-10-Q1"). */
    clave: varchar({ length: 40 }).notNull(),
    estado: estadoJob().notNull().default("EN_CURSO"),
    iniciadoEn: instante().notNull().defaultNow(),
    finalizadoEn: instante(),
    resumen: jsonb(),
    error: text(),
  },
  (t) => [uniqueIndex().on(t.job, t.clave)],
);

/**
 * Outbox: eventos a entregar a sistemas externos (webhooks de sincronización).
 * Se escriben en la misma transacción que el cambio que los origina: si el
 * cambio se confirma, el evento existe; si no, tampoco.
 */
export const eventosSalida = pgTable(
  "eventos_salida",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tipo: varchar({ length: 60 }).notNull(),
    /** Sistema destino ("prodigal", "cotiweb"…). */
    destino: varchar({ length: 30 }).notNull(),
    payload: jsonb().notNull(),
    estado: estadoEvento().notNull().default("PENDIENTE"),
    intentos: smallint().notNull().default(0),
    proximoIntentoEn: instante().notNull().defaultNow(),
    ultimoError: varchar({ length: 500 }),
    creadoEn: instante().notNull().defaultNow(),
    entregadoEn: instante(),
  },
  (t) => [index().on(t.estado, t.proximoIntentoEn)],
);

/**
 * Sistemas que consumen la API (productos). El secreto HMAC se guarda cifrado
 * (AES-256-GCM con la clave maestra del entorno): el servidor lo necesita en
 * claro para verificar firmas, así que un hash no alcanza.
 */
export const apiClientes = pgTable("api_clientes", {
  id: uuid().primaryKey().defaultRandom(),
  sistema: varchar({ length: 30 }).notNull().unique(),
  nombre: varchar({ length: 60 }).notNull(),
  secretoCifrado: text().notNull(),
  webhookUrl: varchar({ length: 300 }),
  activo: boolean().notNull().default(true),
  ultimoUsoEn: instante(),
  ...marcasTiempo,
});

/** Auditoría de cambios sensibles: quién, qué, antes, después y por qué. */
export const auditoria = pgTable(
  "auditoria",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: varchar({ length: 64 }),
    /** "usuario", "sistema", "api:prodigal", "job:diario"… */
    actorTipo: varchar({ length: 40 }).notNull(),
    entidad: varchar({ length: 40 }).notNull(),
    entidadId: varchar({ length: 64 }).notNull(),
    accion: varchar({ length: 40 }).notNull(),
    antes: jsonb(),
    despues: jsonb(),
    motivo: varchar({ length: 300 }),
    /** Empresa afectada, para el histórico de actividad de cada empresa. */
    empresaId: uuid(),
    en: instante().notNull().defaultNow(),
  },
  (t) => [index().on(t.entidad, t.entidadId), index().on(t.en), index().on(t.empresaId, t.en)],
);
