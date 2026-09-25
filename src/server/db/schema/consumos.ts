import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  index,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { mediosEnvio, recursos } from "./catalogo";
import { empresas, oficinas } from "./cuentas";
import { claseRecurso, tipoMovimiento } from "./enums";
import { instante } from "./tipos";
import { contratos } from "./ventas";

/**
 * Pedido de consumo recibido de un producto. La clave (sistema, transacción)
 * hace idempotente la API: un reintento devuelve el mismo resultado sin
 * volver a descontar.
 */
export const consumos = pgTable(
  "consumos",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    oficinaId: uuid().references(() => oficinas.id),
    /** Familia consumida: "notificaciones" o "cotizaciones". */
    familia: varchar({ length: 30 }).notNull(),
    sistema: varchar({ length: 30 }).notNull(),
    transaccionExterna: varchar({ length: 80 }).notNull(),
    medioEnvioId: varchar({ length: 20 }).references(() => mediosEnvio.id),
    cantidad: integer().notNull(),
    factorCentesimos: integer().notNull(),
    creditosSolicitados: integer().notNull(),
    creditosConsumidos: integer().notNull(),
    concepto: varchar({ length: 200 }),
    registradoEn: instante().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex().on(t.sistema, t.transaccionExterna),
    index().on(t.empresaId, t.registradoEn),
  ],
);

/**
 * Libro de movimientos de saldo, inmutable. Saldo de un contrato y recurso =
 * suma de sus movimientos. Cargas positivas (al activarse un contrato),
 * consumos negativos. Para cupos mensuales, `periodo` indica el mes al que
 * pertenece el consumo: el cupo se renueva solo porque cada mes suma desde cero.
 */
export const movimientosSaldo = pgTable(
  "movimientos_saldo",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    contratoId: uuid()
      .notNull()
      .references(() => contratos.id),
    recursoId: varchar({ length: 60 })
      .notNull()
      .references(() => recursos.id),
    clase: claseRecurso().notNull(),
    tipo: tipoMovimiento().notNull(),
    creditos: integer().notNull(),
    /** Mes "AAAA-MM" para CUPO_MENSUAL; `null` para SALDO. */
    periodo: char({ length: 7 }),
    consumoId: uuid().references(() => consumos.id),
    observacion: varchar({ length: 200 }),
    registradoEn: instante().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.contratoId, t.recursoId, t.periodo),
    index().on(t.consumoId),
    check("clase_consumible", sql`${t.clase} in ('CUPO_MENSUAL', 'SALDO')`),
    check("periodo_segun_clase", sql`(${t.clase} = 'CUPO_MENSUAL') = (${t.periodo} is not null)`),
    check(
      "signo_segun_tipo",
      sql`${t.tipo} = 'AJUSTE' or (${t.tipo} = 'CARGA') = (${t.creditos} > 0)`,
    ),
  ],
);
