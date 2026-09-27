import { bigint, boolean, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { rolSofteam } from "./enums";
import { instante, marcasTiempo } from "./tipos";

/*
 * Tablas de Better Auth. Los nombres de las propiedades son los que espera la
 * librería; las tablas y columnas físicas van en español/snake_case.
 */

export const usuarios = pgTable("usuarios", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  /** Rol interno de SOFTeam. `null` = usuario de un cliente. No lo puede fijar el propio usuario. */
  rolSofteam: rolSofteam(),
  /** Segundo factor (app de autenticación) activo: el ingreso pide el código. */
  twoFactorEnabled: boolean().notNull().default(false),
  createdAt: instante().notNull().defaultNow(),
  updatedAt: instante()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const sesiones = pgTable(
  "sesiones",
  {
    id: text().primaryKey(),
    expiresAt: instante().notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    createdAt: instante().notNull().defaultNow(),
    updatedAt: instante()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId)],
);

export const cuentasAuth = pgTable(
  "cuentas_auth",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: instante(),
    refreshTokenExpiresAt: instante(),
    scope: text(),
    password: text(),
    createdAt: instante().notNull().defaultNow(),
    updatedAt: instante()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.userId)],
);

export const verificaciones = pgTable(
  "verificaciones",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: instante().notNull(),
    createdAt: instante().notNull().defaultNow(),
    updatedAt: instante()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.identifier)],
);

/**
 * Segundo factor de cada usuario (plugin two-factor de Better Auth). El
 * secreto TOTP y los códigos de respaldo se guardan cifrados con el secreto
 * de la app; `verified` queda en falso hasta que el usuario confirma el
 * primer código.
 */
export const dosFactores = pgTable(
  "dos_factores",
  {
    id: text().primaryKey(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: instante(),
  },
  (t) => [index().on(t.userId), index().on(t.secret)],
);

/** Límite de intentos persistente (sirve en serverless, donde la memoria no se comparte). */
export const limitesIntentos = pgTable("limites_intentos", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/**
 * Alta en línea pendiente de confirmar el mail. El cliente y la empresa
 * recién se crean (y numeran) al confirmar: así no quedan empresas fantasma
 * de registros abandonados.
 */
export const solicitudesAlta = pgTable("solicitudes_alta", {
  id: uuid().primaryKey().defaultRandom(),
  usuarioId: text()
    .notNull()
    .unique()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  datos: jsonb().notNull(),
  confirmadaEn: instante(),
  clienteId: uuid(),
  ...marcasTiempo,
});
