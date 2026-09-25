import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

/**
 * Lee un parámetro del sistema validando su forma. Si falta o está mal
 * cargado, usa el valor por defecto: un parámetro roto no tira abajo la app.
 */
export async function leerParametro<T>(
  db: Ejecutor,
  clave: string,
  esquema: z.ZodType<T>,
  porDefecto: T,
): Promise<T> {
  const fila = await db.query.parametros.findFirst({ where: eq(t.parametros.clave, clave) });
  const valor = esquema.safeParse(fila?.valor);
  return valor.success ? valor.data : porDefecto;
}
