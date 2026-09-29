import type { Centavos, Porcentaje } from "@/domain/dinero";

/*
 * Interfaz propia de facturación electrónica. El adaptador real (Xubio) se
 * conecta con sus credenciales; mientras tanto, el simulador emite números
 * deterministas para desarrollo y pruebas.
 */

export interface SolicitudFactura {
  ordenId: string;
  numeroOrden: number;
  tipoComprobante: "A" | "B";
  /** Fecha del comprobante ("2026-09-29"): la del cobro. */
  fecha: string;
  cliente: {
    cuit: string;
    nombre: string;
    condicionIva: string;
    /** Código del cliente en Xubio, si SOFTeam lo cargó. */
    xubioId?: string | null | undefined;
    email?: string | null | undefined;
  };
  /** `importe`: precio sin ajuste ni IVA; `total`: lo que suma a la factura, con IVA. */
  lineas: { descripcion: string; importe: Centavos; total: Centavos }[];
  alicuotaIva: Porcentaje;
  netoGravado: Centavos;
  iva: Centavos;
  total: Centavos;
  moneda: string;
  observacion?: string | null | undefined;
}

export interface Comprobante {
  comprobanteId: string;
  /** "A 0001-00012345". */
  numero: string;
}

export interface Facturador {
  readonly nombre: "simulador" | "xubio";
  /**
   * Emite el comprobante de una orden. Debe ser idempotente por `ordenId`:
   * pedir dos veces la misma orden devuelve el mismo comprobante.
   */
  emitir(solicitud: SolicitudFactura): Promise<Comprobante>;
}

export function crearFacturadorSimulado(): Facturador {
  return {
    nombre: "simulador",
    async emitir(s) {
      return {
        comprobanteId: `sim-${s.ordenId}`,
        numero: `${s.tipoComprobante} 0001-${String(s.numeroOrden).padStart(8, "0")}`,
      };
    },
  };
}
