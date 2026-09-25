/**
 * Recursos licenciables. Los límites de un paquete son datos (recurso +
 * cantidad), no columnas fijas: sumar un producto o un límite nuevo no cambia
 * el esquema ni el código.
 */
export type ClaseRecurso =
  /** Se suma: usuarios, pólizas, GB, interfaces. */
  | "CAPACIDAD"
  /** Habilitada si algún contrato vigente la trae: chatbot, API, e-commerce. */
  | "FUNCION"
  /** Cupo que se renueva cada mes: notificaciones o cotizaciones del mes. */
  | "CUPO_MENSUAL"
  /** Prepago sin vencimiento que se agota con el uso. */
  | "SALDO";

/**
 * Cómo se acumula una capacidad entre contratos y unidades. La mayoría se
 * suma (usuarios, pólizas); algunas no, como los años de retención de
 * cartera: dos paquetes de 2 años siguen siendo 2 años.
 */
export type Agregacion = "SUMA" | "MAXIMO";

/** Cantidad a congelar en un contrato: solo se multiplica lo que se suma. */
export function cantidadContratada(
  porUnidad: number,
  unidades: number,
  agregacion: Agregacion,
): number {
  return agregacion === "SUMA" ? porUnidad * unidades : porUnidad;
}

export interface RecursoContratado {
  readonly recurso: string;
  readonly clase: ClaseRecurso;
  /** Por defecto SUMA. */
  readonly agregacion?: Agregacion;
  /** Para FUNCION, cualquier valor > 0 la habilita. */
  readonly cantidad: number;
}

/** Regla de negocio que habilita un recurso a partir de otro. */
export interface ReglaDerivada {
  readonly recurso: string;
  readonly habilitadoSi: { readonly recurso: string; readonly minimo: number };
}

/** Ejemplo documentado: la emisión de CotiWeb requiere 4 o más usuarios de CotiWeb. */
export const REGLAS_DERIVADAS: readonly ReglaDerivada[] = [
  { recurso: "cotiweb.emision", habilitadoSi: { recurso: "cotiweb.usuarios", minimo: 4 } },
];

export interface ValorLicencia {
  readonly clase: ClaseRecurso;
  /** Total licenciado. Para FUNCION: 1 habilitada, 0 no. */
  readonly total: number;
}

export type Licencia = ReadonlyMap<string, ValorLicencia>;

/**
 * Consolida la licencia sumando los recursos de los contratos vigentes. El
 * llamador filtra la vigencia con `estaVigente`; esta función solo suma.
 */
export function consolidarLicencia(
  contratosVigentes: readonly (readonly RecursoContratado[])[],
  reglas: readonly ReglaDerivada[] = REGLAS_DERIVADAS,
): Licencia {
  const licencia = new Map<string, ValorLicencia>();
  for (const recursos of contratosVigentes) {
    for (const { recurso, clase, cantidad, agregacion = "SUMA" } of recursos) {
      const previo = licencia.get(recurso)?.total ?? 0;
      const total =
        clase === "FUNCION"
          ? previo > 0 || cantidad > 0
            ? 1
            : 0
          : agregacion === "MAXIMO"
            ? Math.max(previo, cantidad)
            : previo + cantidad;
      licencia.set(recurso, { clase, total });
    }
  }
  for (const { recurso, habilitadoSi } of reglas) {
    const base = licencia.get(habilitadoSi.recurso)?.total ?? 0;
    const actual = licencia.get(recurso)?.total ?? 0;
    licencia.set(recurso, {
      clase: "FUNCION",
      total: actual > 0 || base >= habilitadoSi.minimo ? 1 : 0,
    });
  }
  return licencia;
}
