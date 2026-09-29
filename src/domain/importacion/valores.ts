import { esCuitValido, normalizarCuit } from "@/domain/cuentas/cuit";
import type { CondicionIva } from "@/domain/facturacion/impuestos";
import { PROVINCIAS } from "@/lib/argentina";
import { normalizarTitulo } from "./csv";

/*
 * Intérpretes de valores de importación: aceptan las formas habituales de
 * escribir cada dato (texto, abreviatura o código) y devuelven el valor de
 * STLic, o `undefined` si no lo reconocen.
 */

const CONDICIONES: Record<string, CondicionIva> = {
  responsableinscripto: "RESPONSABLE_INSCRIPTO",
  ivaresponsableinscripto: "RESPONSABLE_INSCRIPTO",
  respinscripto: "RESPONSABLE_INSCRIPTO",
  ri: "RESPONSABLE_INSCRIPTO",
  "1": "RESPONSABLE_INSCRIPTO",
  monotributo: "MONOTRIBUTO",
  responsablemonotributo: "MONOTRIBUTO",
  monotributista: "MONOTRIBUTO",
  mt: "MONOTRIBUTO",
  m: "MONOTRIBUTO",
  "6": "MONOTRIBUTO",
  exento: "EXENTO",
  ivaexento: "EXENTO",
  ex: "EXENTO",
  e: "EXENTO",
  "4": "EXENTO",
  consumidorfinal: "CONSUMIDOR_FINAL",
  cf: "CONSUMIDOR_FINAL",
  "5": "CONSUMIDOR_FINAL",
};

/** Condición de IVA: texto, abreviatura (RI, MT, EX, CF) o código AFIP (1, 4, 5, 6). */
export const leerCondicionIva = (valor: string): CondicionIva | undefined =>
  CONDICIONES[normalizarTitulo(valor)];

/** Persona humana (F, física, humana) o jurídica (J, jurídica). */
export function leerTipoPersona(valor: string): "FISICA" | "JURIDICA" | undefined {
  const v = normalizarTitulo(valor);
  if (["f", "fisica", "personafisica", "h", "humana", "personahumana"].includes(v)) return "FISICA";
  if (["j", "juridica", "personajuridica"].includes(v)) return "JURIDICA";
  return undefined;
}

const PROVINCIA_POR_NOMBRE = new Map<string, (typeof PROVINCIAS)[number]>([
  ...PROVINCIAS.map((p) => [normalizarTitulo(p), p] as const),
  ["caba", "Ciudad Autónoma de Buenos Aires"],
  ["capitalfederal", "Ciudad Autónoma de Buenos Aires"],
  ["capital", "Ciudad Autónoma de Buenos Aires"],
  ["ciudaddebuenosaires", "Ciudad Autónoma de Buenos Aires"],
  ["bsas", "Buenos Aires"],
  ["pba", "Buenos Aires"],
  ["provinciadebuenosaires", "Buenos Aires"],
  ["tierradelfuegoantartidaeislasdelatlanticosur", "Tierra del Fuego"],
]);

/** Provincia argentina por nombre, con o sin acentos (también CABA, Capital Federal, Bs As). */
export const leerProvincia = (valor: string) => PROVINCIA_POR_NOMBRE.get(normalizarTitulo(valor));

export function leerTipoCliente(valor: string): "DIRECTO" | "CORPORATIVO" | undefined {
  const v = normalizarTitulo(valor);
  if (["", "d", "directo"].includes(v)) return "DIRECTO";
  if (["c", "corporativo", "corp"].includes(v)) return "CORPORATIVO";
  return undefined;
}

export function leerTipoInstalacion(valor: string): "SAAS" | "ON_PREMISE" | undefined {
  const v = normalizarTitulo(valor);
  if (["", "saas", "nube", "cloud", "s"].includes(v)) return "SAAS";
  if (["onpremise", "local", "servidor", "propio", "o", "op"].includes(v)) return "ON_PREMISE";
  return undefined;
}

/** CUIT/CUIL válido (con o sin guiones), normalizado a 11 dígitos. */
export function leerCuit(valor: string): string | undefined {
  return esCuitValido(valor) ? normalizarCuit(valor) : undefined;
}

/** Entero positivo ("0012" → 12). */
export function leerEntero(valor: string): number | undefined {
  const limpio = valor.replace(/[.\s]/g, "");
  return /^\d{1,9}$/.test(limpio) && Number(limpio) > 0 ? Number(limpio) : undefined;
}

/**
 * Código de canal y oficina: "01-002", "01002" o los dos por separado
 * ("1" y "2"). Devuelve el canal de 2 dígitos y la oficina de 3.
 */
export function leerCodigoOficina(
  oficina: string,
  canal?: string,
): { canal: string; oficina: string } | undefined {
  const completo = oficina.replace(/\s/g, "").match(/^(\d{1,2})[-/.]?(\d{3})$/);
  if (completo && !canal) {
    return { canal: (completo[1] as string).padStart(2, "0"), oficina: completo[2] as string };
  }
  if (!canal || !/^\d{1,2}$/.test(canal.trim()) || !/^\d{1,3}$/.test(oficina.trim())) {
    return undefined;
  }
  return { canal: canal.trim().padStart(2, "0"), oficina: oficina.trim().padStart(3, "0") };
}
