import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { POLITICAS_POR_DEFECTO, type Politicas } from "@/server/db/schema/configuracion";
import { auditar } from "../auditoria";
import { registrarCambioEmpresa } from "../integraciones/eventos";

export async function leerPoliticas(db: Ejecutor, empresaId: string): Promise<Politicas> {
  const fila = await db.query.politicasEmpresa.findFirst({
    where: eq(t.politicasEmpresa.empresaId, empresaId),
  });
  return { ...POLITICAS_POR_DEFECTO, ...fila?.politicas };
}

export const esquemaPoliticas = z.object({
  oficinasNotifican: z.boolean(),
  oficinasUsanPozoEmpresa: z.boolean(),
  topeMensualPozoPorOficina: z
    .int({ error: "Ingresá un número entero" })
    .min(0, { error: "No puede ser negativo" })
    .max(10_000_000)
    .nullable(),
  oficinasContratan: z.boolean(),
}) satisfies z.ZodType<Politicas>;

export async function guardarPoliticas(
  db: Db,
  empresaId: string,
  politicas: Politicas,
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const antes = await leerPoliticas(tx, empresaId);
    await tx
      .insert(t.politicasEmpresa)
      .values({ empresaId, politicas })
      .onConflictDoUpdate({ target: t.politicasEmpresa.empresaId, set: { politicas } });
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "politicas",
      empresaId: empresaId,
      entidadId: empresaId,
      accion: "modificacion",
      antes,
      despues: politicas,
    });
  });
}
