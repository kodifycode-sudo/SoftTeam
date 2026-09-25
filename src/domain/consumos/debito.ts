/**
 * Planificación del débito de un consumo (notificaciones, cotizaciones).
 * Función pura: decide de qué fuentes descontar. La persistencia lo aplica
 * dentro de una transacción, con las filas bloqueadas.
 */

export type TipoFuente = "CUPO_MENSUAL" | "SALDO";

export interface FuenteSaldo {
  readonly contratoId: string;
  /** `null`: contrato de la empresa (pozo común). */
  readonly oficinaId: string | null;
  readonly tipo: TipoFuente;
  /** Créditos disponibles hoy (cupo del mes − consumido, o saldo prepago). */
  readonly disponible: number;
  /** Fecha de alta del contrato: se consume primero el más antiguo. */
  readonly desde: string;
}

export interface PedidoConsumo {
  /** Unidades pedidas por el producto (por ejemplo, 100 mensajes). */
  readonly cantidad: number;
  /** Factor del medio en centésimos: mail 100, WhatsApp 250. */
  readonly factorCentesimos: number;
  /** Oficina que consume. `null`: consumo a nivel empresa. */
  readonly oficinaId: string | null;
  readonly modo: "TODO_O_NADA" | "PARCIAL";
  /** Política: la oficina puede usar el pozo de la empresa cuando agota lo suyo. */
  readonly usarPozoEmpresa: boolean;
  /** Tope mensual restante de la oficina sobre el pozo de la empresa (`null` = sin tope). */
  readonly topePozoRestante: number | null;
}

export interface Asignacion {
  readonly contratoId: string;
  readonly tipo: TipoFuente;
  readonly creditos: number;
}

export interface PlanDebito {
  /** Créditos pedidos = ⌈cantidad × factor⌉. */
  readonly solicitado: number;
  readonly consumido: number;
  readonly asignaciones: readonly Asignacion[];
}

/** Créditos que consume un pedido. Redondea hacia arriba: nunca se regala fracción. */
export function creditosPedido(cantidad: number, factorCentesimos: number): number {
  if (!Number.isInteger(cantidad) || cantidad < 0) throw new RangeError("Cantidad inválida");
  if (!Number.isInteger(factorCentesimos) || factorCentesimos <= 0) {
    throw new RangeError("Factor inválido");
  }
  return Math.ceil((cantidad * factorCentesimos) / 100);
}

const ordenFuentes = (a: FuenteSaldo, b: FuenteSaldo): number =>
  // Cupo del mes antes que saldo prepago; dentro de cada uno, FIFO.
  a.tipo === b.tipo ? a.desde.localeCompare(b.desde) : a.tipo === "CUPO_MENSUAL" ? -1 : 1;

/**
 * Orden de débito: primero los contratos de la oficina, después el pozo de la
 * empresa (si la política lo permite, hasta el tope mensual). En cada grupo,
 * cupo mensual antes que saldo prepago, y el más antiguo primero.
 */
export function planificarDebito(
  fuentes: readonly FuenteSaldo[],
  pedido: PedidoConsumo,
): PlanDebito {
  const solicitado = creditosPedido(pedido.cantidad, pedido.factorCentesimos);

  const propias = fuentes
    .filter((f) => f.oficinaId === pedido.oficinaId && f.disponible > 0)
    .sort(ordenFuentes);
  const pozo =
    pedido.oficinaId !== null && pedido.usarPozoEmpresa
      ? fuentes.filter((f) => f.oficinaId === null && f.disponible > 0).sort(ordenFuentes)
      : [];

  const asignaciones: Asignacion[] = [];
  let pendiente = solicitado;

  const tomar = (grupo: readonly FuenteSaldo[], limite: number): void => {
    let restanteGrupo = limite;
    for (const fuente of grupo) {
      if (pendiente === 0 || restanteGrupo === 0) return;
      const creditos = Math.min(fuente.disponible, pendiente, restanteGrupo);
      asignaciones.push({ contratoId: fuente.contratoId, tipo: fuente.tipo, creditos });
      pendiente -= creditos;
      restanteGrupo -= creditos;
    }
  };

  tomar(propias, Number.POSITIVE_INFINITY);
  tomar(pozo, pedido.topePozoRestante ?? Number.POSITIVE_INFINITY);

  const consumido = solicitado - pendiente;
  if (pedido.modo === "TODO_O_NADA" && consumido < solicitado) {
    return { solicitado, consumido: 0, asignaciones: [] };
  }
  return { solicitado, consumido, asignaciones };
}
