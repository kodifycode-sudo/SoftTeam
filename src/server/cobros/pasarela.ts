import type { Centavos } from "@/domain/dinero";
import type { Resultado } from "@/domain/resultado";

/*
 * Interfaz propia de la pasarela de pago. La app no conoce a Mercado Pago:
 * habla con esta interfaz, que implementan el adaptador real y un simulador
 * para desarrollo y pruebas.
 */

export type EstadoPago = "APROBADO" | "RECHAZADO" | "PENDIENTE";

export interface Pago {
  id: string;
  /** Referencia externa: el id de la orden. */
  ordenId: string;
  estado: EstadoPago;
  monto: Centavos;
  moneda: string;
  /** Motivo del rechazo, tal como lo informa la pasarela. */
  detalle?: string | undefined;
}

export interface SolicitudLink {
  ordenId: string;
  numero: number;
  descripcion: string;
  total: Centavos;
  moneda: string;
  /** A dónde vuelve la persona después de pagar. */
  urlRetorno: string;
  /** Dónde la pasarela avisa el resultado (webhook). */
  urlAviso: string;
}

export interface AvisoRecibido {
  url: string;
  headers: Headers;
  cuerpo: string;
}

export interface Pasarela {
  readonly nombre: "simulador" | "mercadopago";
  crearLink(solicitud: SolicitudLink): Promise<{ preferenciaId: string; url: string }>;
  /** Consulta el pago en la pasarela (la fuente de verdad, no el aviso). */
  obtenerPago(pagoId: string): Promise<Pago | undefined>;
  /**
   * Valida la firma del aviso y devuelve el id de pago que informa, o `null`
   * si es un aviso de otro tipo (que se ignora).
   */
  leerAviso(aviso: AvisoRecibido): Resultado<{ pagoId: string } | null, "FIRMA_INVALIDA">;
}
