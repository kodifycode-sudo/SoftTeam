import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import {
  CABECERA_FIRMA,
  CABECERA_SISTEMA,
  CABECERA_TIMESTAMP,
  type ErrorFirma,
  verificarFirma,
} from "@/server/seguridad/firma";
import { secretoDeSistema } from "./sistemas";

export type ErrorAutenticacion = ErrorFirma | "SISTEMA_DESCONOCIDO";

/**
 * Autentica una petición de un producto: sistema conocido y activo, y firma
 * HMAC válida sobre método, ruta, timestamp y cuerpo. Hacia afuera, un
 * sistema desconocido y una firma inválida responden igual (401): el detalle
 * queda solo del lado del servidor.
 */
export async function autenticarPeticion(
  db: Db,
  peticion: Request,
  cuerpo: string,
  claveMaestra: string,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): Promise<{ ok: true; sistema: string } | { ok: false; error: ErrorAutenticacion }> {
  const sistema = peticion.headers.get(CABECERA_SISTEMA)?.trim().toLowerCase();
  if (!sistema) return { ok: false, error: "FIRMA_FALTANTE" };
  const registro = await secretoDeSistema(db, sistema, claveMaestra);
  if (!registro) return { ok: false, error: "SISTEMA_DESCONOCIDO" };

  const url = new URL(peticion.url);
  const verificacion = verificarFirma(
    registro.secreto,
    {
      metodo: peticion.method,
      ruta: url.pathname + url.search,
      timestamp: peticion.headers.get(CABECERA_TIMESTAMP),
      cuerpo,
    },
    peticion.headers.get(CABECERA_FIRMA),
    ahoraSegundos,
  );
  if (!verificacion.ok) return verificacion;

  await db
    .update(t.apiClientes)
    .set({ ultimoUsoEn: new Date() })
    .where(eq(t.apiClientes.id, registro.id));
  return { ok: true, sistema };
}
