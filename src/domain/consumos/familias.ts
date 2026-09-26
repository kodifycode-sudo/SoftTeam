/**
 * Familias de consumo: lo que los productos descuentan por API. Cada una se
 * cubre primero con el cupo del mes y después con el saldo prepago.
 */
export const FAMILIAS_CONSUMO = {
  notificaciones: {
    cupoMensual: "notificaciones.mes",
    saldo: "notificaciones.saldo",
    /** El medio de envío define el factor de consumo (mail 1, WhatsApp 2,5). */
    usaMedio: true,
  },
  cotizaciones: {
    cupoMensual: "cotiweb.cotizaciones_mes",
    saldo: "cotiweb.cotizaciones",
    usaMedio: false,
  },
  /** Tickets de soporte: los consume STLic al abrir un pedido de asistencia. */
  soporte: {
    cupoMensual: "soporte.mes",
    saldo: "soporte.saldo",
    usaMedio: false,
  },
} as const;

export type FamiliaConsumo = keyof typeof FAMILIAS_CONSUMO;

/** Familias que los productos pueden consumir por la API (soporte no: lo consume STLic). */
export const FAMILIAS = [
  "notificaciones",
  "cotizaciones",
] as const satisfies readonly FamiliaConsumo[];

/** Código de oficina completo "CCOOO" (canal + oficina) → partes. */
export function partesCodigoOficina(
  codigo: string,
): { canal: string; oficina: string } | undefined {
  const coincidencia = /^(\d{2})-?(\d{3})$/.exec(codigo.trim());
  return coincidencia
    ? { canal: coincidencia[1] as string, oficina: coincidencia[2] as string }
    : undefined;
}
