import type { TipoMedioPago } from "@/domain/facturacion/medio-pago";

export const ETIQUETA_TIPO: Record<TipoMedioPago, string> = {
  TRANSFERENCIA: "Transferencia",
  LINK_MP: "Link de Mercado Pago",
  SUSCRIPCION_MP: "Suscripción de Mercado Pago",
  PLANILLA: "Planilla (cobro consolidado)",
};
