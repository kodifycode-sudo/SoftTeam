import { and, eq, inArray, ne } from "drizzle-orm";
import { type Alcance, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { oficinaEnAlcance } from "../cuentas/alcance";

export interface EstadoRenovacion {
  noRenovar: boolean;
  /** Número de la orden de renovación, si ya se generó. */
  ordenRenovacion: number | null;
  /** Trimestre inicial (sin día de vencimiento): no se renueva solo, se negocia. */
  aNegociar: boolean;
}

/** Renovación automática y orden de renovación generada, por contrato. */
export async function estadoDeRenovacion(
  db: Ejecutor,
  empresaId: string,
  contratoIds: string[],
): Promise<Map<string, EstadoRenovacion>> {
  if (contratoIds.length === 0) return new Map();
  const [contratos, renovaciones] = await Promise.all([
    db
      .select({
        id: t.contratos.id,
        noRenovar: t.contratos.noRenovar,
        diaVenc: t.contratos.diaVenc,
      })
      .from(t.contratos)
      .where(and(eq(t.contratos.empresaId, empresaId), inArray(t.contratos.id, contratoIds))),
    db
      .select({ anteriorId: t.contratos.contratoAnteriorId, numero: t.ordenes.numero })
      .from(t.contratos)
      .innerJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
      .where(
        and(
          inArray(t.contratos.contratoAnteriorId, contratoIds),
          ne(t.contratos.estado, "CANCELADO"),
        ),
      ),
  ]);
  const ordenDe = new Map(renovaciones.map((r) => [r.anteriorId, r.numero]));
  return new Map(
    contratos.map((c) => [
      c.id,
      {
        noRenovar: c.noRenovar,
        ordenRenovacion: ordenDe.get(c.id) ?? null,
        aNegociar: c.diaVenc === null,
      },
    ]),
  );
}

export type ErrorRenovacion = "NO_EXISTE" | "YA_RENOVADO";

/**
 * El cliente elige si un paquete se renueva solo. Sin renovación automática
 * tampoco recibe avisos de vencimiento. Si la orden de renovación ya se
 * generó, hay que cancelarla (lo hace SOFTeam): cambiar la marca no alcanza.
 */
export async function cambiarRenovacionAutomatica(
  db: Db,
  empresaId: string,
  contratoId: string,
  renovar: boolean,
  actorId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
): Promise<{ ok: true } | { ok: false; error: ErrorRenovacion }> {
  return db.transaction(async (tx) => {
    const [contrato] = await tx
      .select({ id: t.contratos.id, noRenovar: t.contratos.noRenovar })
      .from(t.contratos)
      .where(
        and(
          eq(t.contratos.id, contratoId),
          eq(t.contratos.empresaId, empresaId),
          // Un delegado solo decide sobre los paquetes de sus oficinas.
          oficinaEnAlcance(t.contratos.oficinaId, alcance),
          eq(t.contratos.tipoPaquete, "TEMPORAL"),
          inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        ),
      )
      .for("update");
    if (!contrato) return { ok: false, error: "NO_EXISTE" };
    const renovado = await tx.query.contratos.findFirst({
      columns: { id: true },
      where: and(
        eq(t.contratos.contratoAnteriorId, contratoId),
        ne(t.contratos.estado, "CANCELADO"),
      ),
    });
    if (renovado) return { ok: false, error: "YA_RENOVADO" };
    if (contrato.noRenovar === !renovar) return { ok: true };

    await tx.update(t.contratos).set({ noRenovar: !renovar }).where(eq(t.contratos.id, contratoId));
    await auditar(tx, {
      actorId,
      entidad: "contrato",
      empresaId: empresaId,
      entidadId: contratoId,
      accion: renovar ? "renovar" : "no_renovar",
      antes: { noRenovar: contrato.noRenovar },
      despues: { noRenovar: !renovar },
    });
    return { ok: true };
  });
}
