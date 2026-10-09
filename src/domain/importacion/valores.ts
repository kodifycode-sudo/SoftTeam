import { esCuitValido, normalizarCuit } from "@/domain/cuentas/cuit";
import { normalizarTitulo } from "./csv";

/*
 * Intérpretes de valores de importación: aceptan las formas habituales de
 * escribir cada dato (texto, abreviatura o código) y devuelven el valor de
 * STLic, o `undefined` si no lo reconocen.
 */

/** Formas habituales de escribir las condiciones de la carga inicial. */
const ALIAS_CONDICIONES: Record<string, string> = {
  responsableinscripto: "RESPONSABLE_INSCRIPTO",
  ivaresponsableinscripto: "RESPONSABLE_INSCRIPTO",
  respinscripto: "RESPONSABLE_INSCRIPTO",
  inscripto: "RESPONSABLE_INSCRIPTO",
  ri: "RESPONSABLE_INSCRIPTO",
  monotributo: "MONOTRIBUTO",
  responsablemonotributo: "MONOTRIBUTO",
  monotributista: "MONOTRIBUTO",
  mt: "MONOTRIBUTO",
  m: "MONOTRIBUTO",
  exento: "EXENTO",
  ivaexento: "EXENTO",
  ivasujetoexento: "EXENTO",
  ex: "EXENTO",
  e: "EXENTO",
  consumidorfinal: "CONSUMIDOR_FINAL",
  cf: "CONSUMIDOR_FINAL",
  grancontribuyente: "GRAN_CONTRIBUYENTE",
  gc: "GRAN_CONTRIBUYENTE",
};

/** Códigos del dominio IVACod de la KB (Mejora v2.1, 2.9): son los que trae la exportación. */
const CODIGOS_KB: Record<string, string> = {
  "1": "RESPONSABLE_INSCRIPTO",
  "2": "CONSUMIDOR_FINAL",
  "3": "MONOTRIBUTO",
  "4": "EXENTO",
  "5": "GRAN_CONTRIBUYENTE",
  "6": "MONOTRIBUTO_A",
};

/**
 * Condición de IVA: código de la KB (1 a 6), abreviatura (RI, MT, EX, CF,
 * GC), o el código o el nombre de una condición configurada. Solo devuelve
 * condiciones activas.
 */
export function leerCondicionIva(
  valor: string,
  activas: readonly { codigo: string; nombre: string }[],
): string | undefined {
  const v = normalizarTitulo(valor);
  const codigo =
    CODIGOS_KB[valor.trim()] ??
    ALIAS_CONDICIONES[v] ??
    activas.find((c) => normalizarTitulo(c.codigo) === v || normalizarTitulo(c.nombre) === v)
      ?.codigo;
  return activas.some((c) => c.codigo === codigo) ? codigo : undefined;
}

/** Persona humana (F, física, humana) o jurídica (J, jurídica). */
export function leerTipoPersona(valor: string): "FISICA" | "JURIDICA" | undefined {
  const v = normalizarTitulo(valor);
  if (["f", "fisica", "personafisica", "h", "humana", "personahumana"].includes(v)) return "FISICA";
  if (["j", "juridica", "personajuridica"].includes(v)) return "JURIDICA";
  return undefined;
}

/** Nombres alternativos de las provincias argentinas. */
const ALIAS_PROVINCIAS: Record<string, string> = {
  caba: "Ciudad Autónoma de Buenos Aires",
  capitalfederal: "Ciudad Autónoma de Buenos Aires",
  capital: "Ciudad Autónoma de Buenos Aires",
  ciudaddebuenosaires: "Ciudad Autónoma de Buenos Aires",
  bsas: "Buenos Aires",
  pba: "Buenos Aires",
  provinciadebuenosaires: "Buenos Aires",
  tierradelfuegoantartidaeislasdelatlanticosur: "Tierra del Fuego",
};

/**
 * Provincia del país por nombre, con o sin acentos (en Argentina también CABA,
 * Capital Federal, Bs As). Devuelve el nombre tal como está en la lista.
 */
export function leerProvincia(valor: string, provincias: readonly string[]): string | undefined {
  const buscado = normalizarTitulo(valor);
  const alias = ALIAS_PROVINCIAS[buscado];
  return provincias.find(
    (p) => normalizarTitulo(p) === buscado || (alias !== undefined && p === alias),
  );
}

/**
 * Modo de facturación (`STLicClienteFacModo`, 0 a 3) o su nombre. Acepta el
 * tipo de cliente de archivos viejos: Directo es 0 y Corporativo, 3.
 */
export function leerModoFacturacion(valor: string): 0 | 1 | 2 | 3 | undefined {
  const v = normalizarTitulo(valor);
  if (["", "0", "d", "directo", "pagodirecto"].includes(v)) return 0;
  if (["1", "facturaadelantada"].includes(v)) return 1;
  if (["2", "suscripcion", "suscripcionmp", "suscripciondemercadopago"].includes(v)) return 2;
  if (
    [
      "3",
      "c",
      "corporativo",
      "corp",
      "facturaagrupada",
      "facturaagrupadacontransferencia",
    ].includes(v)
  )
    return 3;
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
