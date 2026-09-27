/**
 * Alcance de un administrador de la empresa: toda la empresa, un canal (sus
 * oficinas) o una oficina. Un administrador con alcance de canal u oficina es
 * un "administrador delegado": solo ve y gestiona lo de su alcance.
 */
export type Alcance =
  | { tipo: "empresa" }
  | { tipo: "canal"; canalId: string }
  | { tipo: "oficina"; canalId: string; oficinaId: string };

export const TODA_LA_EMPRESA: Alcance = { tipo: "empresa" };

/** Alcance guardado en un colaborador (sin canal ni oficina = toda la empresa). */
export function alcanceDe(c: { canalId: string | null; oficinaId: string | null }): Alcance {
  if (c.oficinaId && c.canalId)
    return { tipo: "oficina", canalId: c.canalId, oficinaId: c.oficinaId };
  if (c.canalId) return { tipo: "canal", canalId: c.canalId };
  return TODA_LA_EMPRESA;
}

/** ¿El alcance `actor` incluye todo lo que abarca `destino`? */
export function abarca(actor: Alcance, destino: Alcance): boolean {
  switch (actor.tipo) {
    case "empresa":
      return true;
    case "canal":
      return destino.tipo !== "empresa" && destino.canalId === actor.canalId;
    case "oficina":
      return destino.tipo === "oficina" && destino.oficinaId === actor.oficinaId;
  }
}

/**
 * ¿Ve algo asignado a esta oficina? `null` es lo que es de toda la empresa
 * (contratos o productores sin oficina): solo lo ve quien tiene toda la empresa.
 */
export function abarcaOficina(
  actor: Alcance,
  oficina: { id: string; canalId: string } | null,
): boolean {
  if (actor.tipo === "empresa") return true;
  if (!oficina) return false;
  return actor.tipo === "canal"
    ? oficina.canalId === actor.canalId
    : oficina.id === actor.oficinaId;
}
