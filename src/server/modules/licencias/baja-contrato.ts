import { and, eq, ne } from "drizzle-orm";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { puedeTransicionar } from "@/domain/licencias/contrato";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { registrarCambioEmpresa } from "../integraciones/eventos";

export type ErrorBajaContrato = "NO_EXISTE" | "NO_ACTIVO" | "TIENE_RENOVACION" | "FALTA_MOTIVO";

/**
 * Administración da de baja un contrato activo antes de su vencimiento (un
 * paquete que el cliente deja, un error de carga). Deja de contar para la
 * licencia en el acto, no se renueva y sus saldos dejan de consumirse. El
 * dinero, si corresponde, se resuelve aparte. Si ya tiene la renovación
 * generada, primero hay que cancelar esa orden.
 */
export async function darDeBajaContrato(
  db: Db,
  contratoId: string,
  motivo: string,
  actorId: string,
  hoy: Fecha = hoyArgentina(),
): Promise<{ ok: true; empresaId: string } | { ok: false; error: ErrorBajaContrato }> {
  const texto = motivo.trim().slice(0, 300);
  if (texto.length < 5) return { ok: false, error: "FALTA_MOTIVO" };
  return db.transaction(async (tx) => {
    const [contrato] = await tx
      .select()
      .from(t.contratos)
      .where(eq(t.contratos.id, contratoId))
      .for("update");
    if (!contrato) return { ok: false, error: "NO_EXISTE" };
    if (!puedeTransicionar(contrato.estado, "BAJA")) return { ok: false, error: "NO_ACTIVO" };
    const renovacion = await tx.query.contratos.findFirst({
      columns: { id: true },
      where: and(
        eq(t.contratos.contratoAnteriorId, contratoId),
        ne(t.contratos.estado, "CANCELADO"),
      ),
    });
    if (renovacion) return { ok: false, error: "TIENE_RENOVACION" };

    const observaciones = [contrato.observaciones, `Baja el ${hoy}: ${texto}`]
      .filter(Boolean)
      .join("\n");
    await tx
      .update(t.contratos)
      .set({ estado: "BAJA", noRenovar: true, observaciones })
      .where(eq(t.contratos.id, contratoId));
    await registrarCambioEmpresa(tx, [contrato.empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "contrato",
      entidadId: contratoId,
      empresaId: contrato.empresaId,
      accion: "baja",
      antes: { estado: contrato.estado, hasta: contrato.hasta },
      despues: { estado: "BAJA", motivo: texto },
    });
    return { ok: true, empresaId: contrato.empresaId };
  });
}
