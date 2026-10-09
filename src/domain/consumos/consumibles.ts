import type { FamiliaConsumo } from "./familias";

/*
 * Paquetes consumibles: qué sistema puede pedir
 * cada consumible, cuándo se renueva un paquete por saldo y cómo se devuelven
 * las unidades no usadas. Funciones puras.
 */

/** Productos de SOFTeam que consumen: el sistema que llama a la API se identifica con su id. */
export const PRODUCTOS_CONSUMIDORES = ["prodigal", "cotiweb", "bienseguro", "boletin"] as const;

const esProductoConsumidor = (sistema: string): boolean =>
  (PRODUCTOS_CONSUMIDORES as readonly string[]).includes(sistema);

/**
 * Quién consume qué: presupuestos (cotizaciones) solo CotiWeb; los tickets de
 * soporte solo STLic, al abrir un pedido; STLic no consume otra cosa.
 */
export function familiaHabilitada(familia: FamiliaConsumo, sistema: string): boolean {
  if (familia === "soporte" || sistema === "stlic")
    return familia === "soporte" && sistema === "stlic";
  return familia !== "cotizaciones" || sistema === "cotiweb";
}

/**
 * Producto vivo para el pedido: el del sistema que consume, si es un producto
 * de SOFTeam. Otros sistemas (integraciones propias) no se controlan.
 */
export function productoDelSistemaVivo(sistema: string, vivos: ReadonlySet<string>): boolean {
  return !esProductoConsumidor(sistema) || vivos.has(sistema);
}

/**
 * Producto que justifica renovar un consumible: notificaciones, cualquier
 * producto vivo; presupuestos, CotiWeb.
 */
export function familiaConProductoVivo(familia: FamiliaConsumo, vivos: ReadonlySet<string>) {
  if (familia === "cotizaciones") return vivos.has("cotiweb");
  if (familia === "notificaciones") return PRODUCTOS_CONSUMIDORES.some((p) => vivos.has(p));
  return false;
}

export type ResultadoPedido = "OK" | "PARCIAL" | "SIN_SALDO";

export function resultadoPedido(solicitado: number, consumido: number): ResultadoPedido {
  if (consumido >= solicitado) return "OK";
  return consumido > 0 ? "PARCIAL" : "SIN_SALDO";
}

/**
 * Renovación por saldo: cuando le queda `porcentaje` % o menos de lo
 * que trajo. Los demás controles (marca, renovación previa, producto vivo)
 * los resuelve quien llama.
 */
export function saldoParaRenovar(saldo: number, cantidad: number, porcentaje: number): boolean {
  return cantidad > 0 && saldo * 100 <= cantidad * porcentaje;
}

export interface DestinoReintegro {
  readonly contratoId: string;
  readonly tipo: "CUPO_MENSUAL" | "SALDO";
  /** Créditos que todavía puede recibir. */
  readonly capacidad: number;
}

export interface AsignacionReintegro {
  readonly contratoId: string;
  readonly tipo: "CUPO_MENSUAL" | "SALDO";
  readonly creditos: number;
}

/**
 * Reparte un reintegro: primero los consumibles del alcance, del más
 * nuevo al más viejo, hasta lo que trajo cada uno (`capacidad` = cantidad −
 * saldo); lo que no entra vuelve a los contratos de los que salió la
 * solicitud (`capacidad` = lo que dio − lo ya reintegrado). Un saldo que ya
 * se llenó como destino no recibe más como origen. Devuelve `null` si no
 * entra todo.
 */
export function planificarReintegro(
  creditos: number,
  destinos: readonly DestinoReintegro[],
  origenes: readonly DestinoReintegro[],
): AsignacionReintegro[] | null {
  const asignaciones = new Map<string, AsignacionReintegro>();
  const llenos = new Set(destinos.map((d) => `${d.contratoId}|${d.tipo}`));
  let pendiente = creditos;
  const asignar = (d: DestinoReintegro) => {
    const clave = `${d.contratoId}|${d.tipo}`;
    const toma = Math.min(Math.max(d.capacidad, 0), pendiente);
    if (toma === 0) return;
    const ya = asignaciones.get(clave)?.creditos ?? 0;
    asignaciones.set(clave, { contratoId: d.contratoId, tipo: d.tipo, creditos: ya + toma });
    pendiente -= toma;
  };
  for (const d of destinos) asignar(d);
  for (const o of origenes) {
    if (o.tipo === "SALDO" && llenos.has(`${o.contratoId}|${o.tipo}`)) continue;
    asignar(o);
  }
  return pendiente === 0 ? [...asignaciones.values()] : null;
}
