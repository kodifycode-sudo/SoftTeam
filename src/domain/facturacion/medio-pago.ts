import type { Porcentaje } from "../dinero";
import { exito, type Resultado, rechazo } from "../resultado";

/** Momento de la contratación: define qué medios de pago se ofrecen. */
export type Instancia = "ALTA_INICIAL" | "ADICIONAL" | "RENOVACION";

export type TipoMedioPago = "TRANSFERENCIA" | "LINK_MP" | "SUSCRIPCION_MP" | "PLANILLA";

export interface MedioPago {
  readonly id: string;
  readonly tipo: TipoMedioPago;
  readonly activo: boolean;
  /** `null`: disponible en todos los países. */
  readonly paisId: string | null;
  readonly habilitadoAlta: boolean;
  readonly habilitadoAdicional: boolean;
  readonly habilitadoRenovacion: boolean;
  /** Positivo = recargo, negativo = bonificación. Se aplica antes del IVA. */
  readonly ajustePorcentaje: Porcentaje;
  /** Cobranza por planilla: habilita la facturación consolidada al grupo. */
  readonly planilla: boolean;
}

const HABILITADO_POR_INSTANCIA: Record<Instancia, (m: MedioPago) => boolean> = {
  ALTA_INICIAL: (m) => m.habilitadoAlta,
  ADICIONAL: (m) => m.habilitadoAdicional,
  RENOVACION: (m) => m.habilitadoRenovacion,
};

/**
 * Un medio es utilizable solo si pasa TODAS las condiciones. (En SOFTeam, una
 * cadena de If sueltos terminaba en un Else que lo habilitaba igual.)
 */
export function validarMedioPago(
  medio: MedioPago | undefined,
  contexto: { readonly paisId: string; readonly instancia: Instancia },
): Resultado<MedioPago, "MEDIO_NO_HABILITADO"> {
  if (!medio) return rechazo("MEDIO_NO_HABILITADO", "Medio inexistente");
  if (!medio.activo) return rechazo("MEDIO_NO_HABILITADO", "Medio inactivo");
  if (medio.paisId !== null && medio.paisId !== contexto.paisId) {
    return rechazo("MEDIO_NO_HABILITADO", "Medio de otro país");
  }
  if (!HABILITADO_POR_INSTANCIA[contexto.instancia](medio)) {
    return rechazo("MEDIO_NO_HABILITADO", `No habilitado para ${contexto.instancia}`);
  }
  return exito(medio);
}

/**
 * A quién se factura la orden, en este orden:
 * 1. al cliente del grupo, si el medio es de planilla y el grupo tiene
 *    facturación consolidada;
 * 2. en la compra delegada, al cliente de facturación de la oficina, si
 *    SOFTeam le asignó uno;
 * 3. al propio cliente.
 */
export function resolverClienteFacturacion(entrada: {
  readonly clienteId: string;
  readonly clienteFacturacionGrupoId: string | null;
  readonly clienteFacturacionOficinaId?: string | null;
  readonly medio: MedioPago;
}): string {
  if (entrada.medio.planilla && entrada.clienteFacturacionGrupoId) {
    return entrada.clienteFacturacionGrupoId;
  }
  return entrada.clienteFacturacionOficinaId ?? entrada.clienteId;
}
