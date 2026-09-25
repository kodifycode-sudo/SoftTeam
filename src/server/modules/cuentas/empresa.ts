import { and, asc, count, eq, or } from "drizzle-orm";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { POLITICAS_POR_DEFECTO } from "@/server/db/schema/configuracion";

/** Datos de la empresa para el portal: instalación, administradores y políticas. */
export async function obtenerEmpresaDelPortal(db: Ejecutor, empresaId: string) {
  const empresa = await db.query.empresas.findFirst({ where: eq(t.empresas.id, empresaId) });
  if (!empresa) return undefined;
  const [administradores, politicas, oficinas] = await Promise.all([
    db
      .select({
        id: t.colaboradores.id,
        nombre: t.colaboradores.nombre,
        email: t.colaboradores.email,
        telefono: t.colaboradores.telefono,
        adminGeneral: t.colaboradores.adminGeneral,
        adminComercial: t.colaboradores.adminComercial,
        adminOperativo: t.colaboradores.adminOperativo,
      })
      .from(t.colaboradores)
      .where(
        and(
          eq(t.colaboradores.empresaId, empresaId),
          eq(t.colaboradores.activo, true),
          or(
            eq(t.colaboradores.adminGeneral, true),
            eq(t.colaboradores.adminComercial, true),
            eq(t.colaboradores.adminOperativo, true),
          ),
        ),
      )
      .orderBy(asc(t.colaboradores.nombre)),
    db.query.politicasEmpresa.findFirst({ where: eq(t.politicasEmpresa.empresaId, empresaId) }),
    db.select({ total: count() }).from(t.oficinas).where(eq(t.oficinas.empresaId, empresaId)),
  ]);
  return {
    ...empresa,
    administradores,
    politicas: politicas?.politicas ?? POLITICAS_POR_DEFECTO,
    oficinas: oficinas[0]?.total ?? 0,
  };
}
