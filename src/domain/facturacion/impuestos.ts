import type { Porcentaje } from "../dinero";

/**
 * Condición frente al IVA del cliente de facturación. "Gran contribuyente"
 * de los documentos originales es un Responsable Inscripto a estos efectos.
 */
export const CONDICIONES_IVA = [
  "RESPONSABLE_INSCRIPTO",
  "MONOTRIBUTO",
  "EXENTO",
  "CONSUMIDOR_FINAL",
] as const;
export type CondicionIva = (typeof CONDICIONES_IVA)[number];

export type TipoComprobante = "A" | "B";

/** Exento no paga IVA. El resto, la alícuota general del país. */
export function alicuotaIva(condicion: CondicionIva, alicuotaGeneral: Porcentaje): Porcentaje {
  return condicion === "EXENTO" ? 0n : alicuotaGeneral;
}

/**
 * SOFTeam emite como Responsable Inscripto: Factura A a otro Responsable
 * Inscripto; Factura B en los demás casos. El importe es el mismo: cambia
 * solo si el IVA aparece discriminado en el comprobante.
 */
export function tipoComprobante(condicion: CondicionIva): TipoComprobante {
  return condicion === "RESPONSABLE_INSCRIPTO" ? "A" : "B";
}
