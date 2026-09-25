import "server-only";
import { and, asc, eq, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { obtenerDb } from "@/server/db";
import { clientes, colaboradores, empresas } from "@/server/db/schema";
import { type RolSofteam, rolSofteamActual } from "@/server/modules/cuentas/usuarios-softeam";
import { obtenerAuth } from ".";

export type { RolSofteam };

/** Sesión del request actual (memorizada por render: se consulta una sola vez). */
export const obtenerSesion = cache(async () => {
  // Primero los headers: marca la ruta como dinámica antes de tocar la base.
  const cabeceras = await headers();
  const auth = await obtenerAuth();
  return auth.api.getSession({ headers: cabeceras });
});

export async function requerirUsuario() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  return sesion;
}

/**
 * Rol SOFTeam vigente del usuario de la sesión. Se lee de la base y no de la
 * sesión (que se cachea en la cookie unos minutos): un cambio de rol o una
 * baja rigen en el acto.
 */
const rolDeLaSesion = cache(async (usuarioId: string) =>
  rolSofteamActual(await obtenerDb(), usuarioId),
);

/** Exige un usuario de SOFTeam y, si se indican, alguno de los roles. */
export async function requerirSofteam(roles?: readonly RolSofteam[]) {
  const sesion = await requerirUsuario();
  const rol = await rolDeLaSesion(sesion.user.id);
  if (!rol) redirect("/portal");
  if (roles && !roles.includes(rol)) forbidden();
  return { ...sesion, rol };
}

export const COOKIE_EMPRESA = "stlic-empresa";

export interface ContextoCliente {
  usuarioId: string;
  /** Colaborador del usuario en la empresa activa. */
  colaboradorId: string;
  nombreUsuario: string;
  email: string;
  empresaId: string;
  empresaNombre: string;
  empresaNumero: number;
  clienteId: string;
  clienteNombre: string;
  adminGeneral: boolean;
  adminComercial: boolean;
  adminOperativo: boolean;
  /** Empresas que puede administrar (para el selector). */
  empresas: { id: string; nombre: string; numero: number }[];
}

/**
 * Exige un administrador de un cliente y resuelve la empresa activa (cookie
 * o la primera). Toda consulta del portal debe filtrar por `empresaId`.
 */
export const requerirCliente = cache(async (): Promise<ContextoCliente> => {
  const sesion = await requerirUsuario();
  if (await rolDeLaSesion(sesion.user.id)) redirect("/admin");

  const db = await obtenerDb();
  const filas = await db
    .select({
      colaboradorId: colaboradores.id,
      empresaId: empresas.id,
      empresaNombre: empresas.nombre,
      empresaNumero: empresas.numero,
      clienteId: clientes.id,
      clienteNombre: clientes.nombre,
      adminGeneral: colaboradores.adminGeneral,
      adminComercial: colaboradores.adminComercial,
      adminOperativo: colaboradores.adminOperativo,
    })
    .from(colaboradores)
    .innerJoin(empresas, eq(empresas.id, colaboradores.empresaId))
    .innerJoin(clientes, eq(clientes.id, empresas.clienteId))
    .where(
      and(
        eq(colaboradores.usuarioId, sesion.user.id),
        eq(colaboradores.activo, true),
        eq(empresas.activa, true),
        or(
          eq(colaboradores.adminGeneral, true),
          eq(colaboradores.adminComercial, true),
          eq(colaboradores.adminOperativo, true),
        ),
      ),
    )
    .orderBy(asc(empresas.numero));

  if (filas.length === 0) redirect("/sin-acceso");

  const elegida = (await cookies()).get(COOKIE_EMPRESA)?.value;
  const actual = filas.find((f) => f.empresaId === elegida) ?? (filas[0] as (typeof filas)[number]);

  return {
    usuarioId: sesion.user.id,
    nombreUsuario: sesion.user.name,
    email: sesion.user.email,
    ...actual,
    empresas: filas.map((f) => ({
      id: f.empresaId,
      nombre: f.empresaNombre,
      numero: f.empresaNumero,
    })),
  };
});

/** Permisos del portal: comercial (paquetes y pagos) u operativo (configuración). */
export const puedeComprar = (c: ContextoCliente) => c.adminGeneral || c.adminComercial;
export const puedeConfigurar = (c: ContextoCliente) => c.adminGeneral || c.adminOperativo;

/** Exige permiso de configuración (páginas de usuarios, aseguradoras, productores y políticas). */
export async function requerirConfiguracion(): Promise<ContextoCliente> {
  const contexto = await requerirCliente();
  if (!puedeConfigurar(contexto)) forbidden();
  return contexto;
}

/** Exige permiso comercial (carrito y órdenes de la empresa). */
export async function requerirComercial(): Promise<ContextoCliente> {
  const contexto = await requerirCliente();
  if (!puedeComprar(contexto)) forbidden();
  return contexto;
}
