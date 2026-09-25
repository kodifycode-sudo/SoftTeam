import "server-only";
import { after } from "next/server";
import { claveMaestra } from "@/env";
import { obtenerDb } from "@/server/db";
import { entregarEventos } from "./eventos";

/**
 * Intenta entregar los avisos pendientes apenas termina la respuesta, sin
 * demorar al usuario. El proceso programado (cron) es la red de seguridad:
 * lo que falle acá se reintenta allá.
 */
export function programarEntregaDeEventos() {
  after(async () => {
    try {
      await entregarEventos(await obtenerDb(), { claveMaestra });
    } catch (error) {
      console.error(
        "[eventos] no se pudieron entregar ahora; los toma el proceso programado",
        error,
      );
    }
  });
}
