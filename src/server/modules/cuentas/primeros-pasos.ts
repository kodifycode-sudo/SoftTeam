import { and, count, eq, or } from "drizzle-orm";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

export type Paso = "paquetes" | "usuarios" | "aseguradoras" | "productores" | "marca";

/**
 * Qué le falta configurar a una empresa para aprovechar los productos. Cada
 * paso se da por hecho con lo mínimo (un paquete, un usuario con acceso…).
 */
export async function pasosCompletados(
  db: Ejecutor,
  empresaId: string,
  tieneLicencia: boolean,
): Promise<Record<Paso, boolean>> {
  const contar = async (consulta: Promise<{ total: number }[]>) =>
    ((await consulta)[0]?.total ?? 0) > 0;
  const [usuarios, aseguradoras, productores, marca] = await Promise.all([
    contar(
      db
        .select({ total: count() })
        .from(t.colaboradores)
        .where(
          and(
            eq(t.colaboradores.empresaId, empresaId),
            eq(t.colaboradores.activo, true),
            or(
              eq(t.colaboradores.accesoProdigal, true),
              eq(t.colaboradores.accesoCotiweb, true),
              eq(t.colaboradores.accesoBienseguro, true),
              eq(t.colaboradores.accesoBoletin, true),
            ),
          ),
        ),
    ),
    contar(
      db
        .select({ total: count() })
        .from(t.empresaAseguradoras)
        .where(
          and(
            eq(t.empresaAseguradoras.empresaId, empresaId),
            eq(t.empresaAseguradoras.activa, true),
          ),
        ),
    ),
    contar(
      db
        .select({ total: count() })
        .from(t.productores)
        .where(and(eq(t.productores.empresaId, empresaId), eq(t.productores.activo, true))),
    ),
    contar(
      db
        .select({ total: count() })
        .from(t.marcasEmpresa)
        .where(eq(t.marcasEmpresa.empresaId, empresaId)),
    ),
  ]);
  return { paquetes: tieneLicencia, usuarios, aseguradoras, productores, marca };
}
