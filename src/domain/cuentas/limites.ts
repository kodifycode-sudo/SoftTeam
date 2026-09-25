import { type Fecha, inicioDeMes, sumarMeses } from "../fecha";
import { exito, type Resultado, rechazo } from "../resultado";

/*
 * Límites de configuración (4.5): usuarios activos por producto e interfaces
 * activas por aseguradora no pueden superar lo licenciado. Se valida al
 * activar; si la licencia baja, no se desactiva nada solo: se informa el
 * exceso y el administrador elige qué dar de baja.
 */

export const PRODUCTOS_CON_ACCESO = ["prodigal", "cotiweb", "bienseguro", "boletin"] as const;
export type ProductoAcceso = (typeof PRODUCTOS_CON_ACCESO)[number];

/**
 * Recurso que limita los usuarios de cada producto. El Boletín no limita
 * usuarios: alcanza con tenerlo licenciado.
 */
export const RECURSO_USUARIOS: Record<ProductoAcceso, string | null> = {
  prodigal: "prodigal.usuarios",
  cotiweb: "cotiweb.usuarios",
  bienseguro: "bienseguro.usuarios",
  boletin: null,
};

export const TIPOS_INTERFAZ = ["prodigal", "cotiweb"] as const;
export type TipoInterfaz = (typeof TIPOS_INTERFAZ)[number];

export const RECURSO_INTERFACES: Record<TipoInterfaz, string> = {
  prodigal: "prodigal.interfaces",
  cotiweb: "cotiweb.interfaces",
};

export interface Uso {
  /** Cantidad licenciada hoy (`null`: sin límite de cantidad, alcanza con el producto). */
  licenciados: number | null;
  enUso: number;
}

export type ErrorLimite = "SIN_LICENCIA" | "LIMITE_ALCANZADO";

/** ¿Se puede activar uno más? */
export function puedeActivar(uso: Uso, productoLicenciado: boolean): Resultado<void, ErrorLimite> {
  if (!productoLicenciado) return rechazo("SIN_LICENCIA");
  if (uso.licenciados === null) return exito(undefined);
  if (uso.licenciados <= 0) return rechazo("SIN_LICENCIA");
  if (uso.enUso >= uso.licenciados) {
    return rechazo("LIMITE_ALCANZADO", `${uso.enUso} de ${uso.licenciados} en uso`);
  }
  return exito(undefined);
}

/** Hay más activos que licenciados (la licencia bajó después de activarlos). */
export const excedeLicencia = (uso: Uso): boolean =>
  uso.licenciados !== null && uso.enUso > uso.licenciados;

/** La baja de una interfaz rige desde el primer día del mes siguiente. */
export const inicioMesSiguiente = (hoy: Fecha): Fecha => sumarMeses(inicioDeMes(hoy), 1);

/** Una interfaz marcada sigue vigente hasta que rige su baja programada. */
export function interfazVigente(marcada: boolean, bajaDesde: Fecha | null, hoy: Fecha): boolean {
  return marcada && (bajaDesde === null || hoy < bajaDesde);
}

// ─── Permisos de administración de la cuenta ───────────────────────────────

export interface Permisos {
  adminGeneral: boolean;
  adminComercial: boolean;
  adminOperativo: boolean;
}

export const tienePermisos = (p: Permisos): boolean =>
  p.adminGeneral || p.adminComercial || p.adminOperativo;

const mismosPermisos = (a: Permisos, b: Permisos) =>
  a.adminGeneral === b.adminGeneral &&
  a.adminComercial === b.adminComercial &&
  a.adminOperativo === b.adminOperativo;

export type ErrorPermisos = "SIN_PERMISO" | "PROPIO" | "ULTIMO_ADMIN";

export interface CambioColaborador {
  actor: Permisos & { colaboradorId: string };
  colaboradorId: string | null;
  /** Estado previo (`null` en un alta). */
  antes: (Permisos & { activo: boolean }) | null;
  despues: Permisos & { activo: boolean };
  /** Administradores generales activos hoy, incluido el colaborador si lo es. */
  adminsGenerales: number;
}

/**
 * Quién puede cambiar qué:
 * - Solo un administrador general da, quita o afecta permisos de administración
 *   (incluye dar de baja a un administrador).
 * - Nadie se quita permisos ni se da de baja a sí mismo (evita quedar afuera
 *   por error).
 * - La empresa nunca queda sin un administrador general activo.
 */
export function validarCambioColaborador(c: CambioColaborador): Resultado<void, ErrorPermisos> {
  const antes = c.antes ?? {
    adminGeneral: false,
    adminComercial: false,
    adminOperativo: false,
    activo: false,
  };
  const administrabaAntes = antes.activo && tienePermisos(antes);
  const administraDespues = c.despues.activo && tienePermisos(c.despues);
  const tocaPermisos =
    (administrabaAntes || administraDespues) &&
    (!mismosPermisos(antes, c.despues) || antes.activo !== c.despues.activo);

  if (tocaPermisos && !c.actor.adminGeneral) return rechazo("SIN_PERMISO");
  if (tocaPermisos && c.colaboradorId === c.actor.colaboradorId) return rechazo("PROPIO");

  const eraGeneral = antes.activo && antes.adminGeneral;
  const sigueGeneral = c.despues.activo && c.despues.adminGeneral;
  if (eraGeneral && !sigueGeneral && c.adminsGenerales <= 1) return rechazo("ULTIMO_ADMIN");
  return exito(undefined);
}
