import { customType, date, timestamp } from "drizzle-orm/pg-core";
import {
  aTextoDecimal,
  type Centavos,
  centavos,
  type Porcentaje,
  porcentaje,
} from "@/domain/dinero";
import type { Fecha } from "@/domain/fecha";

/** Importe exacto: `numeric(14,2)` en la base, centavos `bigint` en el código. */
export const dinero = customType<{ data: Centavos; driverData: string }>({
  dataType: () => "numeric(14, 2)",
  toDriver: (valor) => aTextoDecimal(valor),
  fromDriver: (valor) => centavos(String(valor)),
});

/** Porcentaje con dos decimales: `numeric(7,2)` en la base, centésimos de punto en el código. */
export const pct = customType<{ data: Porcentaje; driverData: string }>({
  dataType: () => "numeric(7, 2)",
  toDriver: (valor) => aTextoDecimal(valor),
  fromDriver: (valor) => porcentaje(String(valor)),
});

/** Fecha de calendario sin hora. */
export const fechaCol = () => date({ mode: "string" }).$type<Fecha>();

/** Instante con zona horaria. */
export const instante = () => timestamp({ withTimezone: true, mode: "date" });

/** Columnas de auditoría de fila. `actualizadoEn` se mantiene desde la app. */
export const marcasTiempo = {
  creadoEn: instante().notNull().defaultNow(),
  actualizadoEn: instante()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
