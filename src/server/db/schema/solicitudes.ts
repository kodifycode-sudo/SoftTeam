import { sql } from "drizzle-orm";
import { char, index, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { usuarios } from "./auth";
import { empresas, oficinas } from "./cuentas";
import { estadoSolicitud } from "./enums";
import { instante, marcasTiempo } from "./tipos";

/**
 * Pedido de la empresa para facturar las compras de una oficina a otro
 * cliente (o volver a facturarlas a la empresa). Lo resuelve SOFTeam: el
 * cambio recién rige cuando se aprueba.
 */
export const solicitudesFacturacion = pgTable(
  "solicitudes_facturacion",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: uuid()
      .notNull()
      .references(() => empresas.id),
    oficinaId: uuid()
      .notNull()
      .references(() => oficinas.id),
    /** CUIT del cliente a facturar; `null`: volver al cliente de la empresa. */
    cuit: char({ length: 11 }),
    comentario: varchar({ length: 300 }),
    estado: estadoSolicitud().notNull().default("PENDIENTE"),
    solicitadoPorId: text()
      .notNull()
      .references(() => usuarios.id),
    resueltoPorId: text().references(() => usuarios.id),
    resueltoEn: instante(),
    /** Motivo del rechazo (o nota de la aprobación) que ve la empresa. */
    respuesta: varchar({ length: 300 }),
    ...marcasTiempo,
  },
  (t) => [
    // Una sola solicitud pendiente por oficina.
    uniqueIndex("solicitud_pendiente_por_oficina")
      .on(t.oficinaId)
      .where(sql`${t.estado} = 'PENDIENTE'`),
    index().on(t.empresaId, t.estado),
  ],
);
