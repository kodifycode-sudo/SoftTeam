import type { Porcentaje } from "../dinero";
import { exito, type Resultado, rechazo } from "../resultado";

/**
 * Condición frente al IVA del receptor. Es un dato configurable por
 * Administración (alícuota, comprobante, código ARCA): este módulo no fija
 * ningún valor, solo decide si con esa condición se puede facturar.
 */
export type TipoComprobante = "A" | "B" | "E";

export interface CondicionFiscal {
  readonly codigo: string;
  readonly codigoArca: number;
  readonly alicuota: Porcentaje;
  readonly comprobante: TipoComprobante;
  readonly activa: boolean;
}

export type RechazoCondicion = "IVA_COND_INVALIDA" | "COMP_NO_HABILITADO";

export interface CondicionParaFacturar {
  readonly codigo: string;
  readonly codigoArca: number;
  readonly alicuota: Porcentaje;
  readonly comprobante: "A" | "B";
}

/**
 * No hay condición por defecto: suponer Consumidor Final ante un dato
 * faltante emitiría una Factura B a un inscripto. El comprobante E
 * (exterior) todavía no se emite.
 */
export function condicionParaFacturar(
  condicion: CondicionFiscal | undefined,
): Resultado<CondicionParaFacturar, RechazoCondicion> {
  if (!condicion?.activa) return rechazo("IVA_COND_INVALIDA");
  if (condicion.comprobante === "E") return rechazo("COMP_NO_HABILITADO");
  return exito({
    codigo: condicion.codigo,
    codigoArca: condicion.codigoArca,
    alicuota: condicion.alicuota,
    comprobante: condicion.comprobante,
  });
}

const LARGO_CODIGO = 30;

/**
 * Código de una condición nueva, a partir del nombre ("Monotributo social"
 * → MONOTRIBUTO_SOCIAL). Único entre todas: los clientes y las órdenes
 * guardan solo el código, sin el país.
 */
export function codigoCondicionIva(nombre: string, existentes: readonly string[]): string {
  const base =
    nombre
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, LARGO_CODIGO) || "CONDICION";
  const usados = new Set(existentes.map((c) => c.toUpperCase()));
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) {
    const sufijo = `_${n}`;
    const candidato = base.slice(0, LARGO_CODIGO - sufijo.length) + sufijo;
    if (!usados.has(candidato)) return candidato;
  }
}
