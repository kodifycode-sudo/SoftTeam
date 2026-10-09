import "server-only";
import { headers } from "next/headers";
import { esProduccion } from "@/env";
import { obtenerDb } from "@/server/db";
import { ipDe, type Limite, registrarIntento } from "@/server/seguridad/intentos";

const MINUTO = 60;

/**
 * Límites de las acciones públicas, por IP y (si la acción lo tiene) por
 * mail. Por mail se frena la fuerza bruta contra una cuenta desde muchas
 * IPs y el envío repetido de códigos a una misma casilla.
 */
const LIMITES = {
  ingresar: {
    ip: { max: 20, ventanaSegundos: MINUTO },
    email: { max: 10, ventanaSegundos: 15 * MINUTO },
  },
  segundoFactor: { ip: { max: 10, ventanaSegundos: MINUTO } },
  registrarse: { ip: { max: 5, ventanaSegundos: 10 * MINUTO } },
  verificarCodigo: { ip: { max: 10, ventanaSegundos: MINUTO } },
  /** Cada pedido manda un mail. */
  enviarCodigo: {
    ip: { max: 10, ventanaSegundos: 10 * MINUTO },
    email: { max: 3, ventanaSegundos: 10 * MINUTO },
  },
} satisfies Record<string, { ip: Limite; email?: Limite }>;

export type AccionLimitada = keyof typeof LIMITES;

/**
 * Cuenta un intento de la acción y dice si se puede seguir. Se cuentan
 * todas las claves (IP y mail) aunque una ya esté agotada.
 *
 * Solo en producción (incluido el despliegue de pruebas): en desarrollo los
 * e2e ingresan decenas de veces con el mismo usuario desde la misma IP.
 */
export async function intentoPermitido(accion: AccionLimitada, email?: string): Promise<boolean> {
  if (!esProduccion) return true;
  const limites: { ip: Limite; email?: Limite } = LIMITES[accion];
  const ip = ipDe(await headers());
  const db = await obtenerDb();
  const usos = await Promise.all([
    registrarIntento(db, `${accion}:ip:${ip}`, limites.ip),
    ...(limites.email && email
      ? [registrarIntento(db, `${accion}:email:${email.toLowerCase()}`, limites.email)]
      : []),
  ]);
  return usos.every((u) => u.permitido);
}

const REENVIOS: Limite = { max: 3, ventanaSegundos: 60 * MINUTO };

/**
 * Reenvíos de un mail al mismo destino (invitación, link de pago): 3 por
 * hora. Es por destino y no por IP, así que rige también en desarrollo.
 */
export async function reenvioPermitido(destino: string): Promise<boolean> {
  const uso = await registrarIntento(await obtenerDb(), `reenvio:${destino}`, REENVIOS);
  return uso.permitido;
}
