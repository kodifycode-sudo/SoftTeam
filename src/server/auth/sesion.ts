import "server-only";
import { and, asc, eq, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { type Alcance, alcanceDe, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import { obtenerDb } from "@/server/db";
import { canales, clientes, colaboradores, empresas, oficinas } from "@/server/db/schema";
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
/** Oficina para la que compra un delegado de canal (se valida contra su canal). */
export const COOKIE_OFICINA_COMPRA = "stlic-oficina-compra";

export interface OficinaCompra {
  id: string;
  /** "Oficina 01-002 · Rosario" */
  etiqueta: string;
}

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
  /**
   * Qué parte de la empresa administra. El administrador general siempre
   * tiene toda la empresa; los demás pueden ser delegados de un canal u oficina.
   */
  alcance: Alcance;
  /** "Oficina 01-002 · Centro" o "Canal 01 · Norte" (`null` con toda la empresa). */
  alcanceNombre: string | null;
  /**
   * Compra delegada: oficina a la que se asigna lo que compra (`null`: toda
   * la empresa, o un delegado de canal sin oficinas activas).
   */
  oficinaCompra: OficinaCompra | null;
  /** Delegado de canal: oficinas entre las que elige para quién compra. */
  oficinasCompra: OficinaCompra[];
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
      canalId: colaboradores.canalId,
      oficinaId: colaboradores.oficinaId,
      canalCodigo: canales.codigo,
      canalNombre: canales.nombre,
      oficinaCodigo: oficinas.codigo,
      oficinaNombre: oficinas.nombre,
    })
    .from(colaboradores)
    .innerJoin(empresas, eq(empresas.id, colaboradores.empresaId))
    .leftJoin(canales, eq(canales.id, colaboradores.canalId))
    .leftJoin(oficinas, eq(oficinas.id, colaboradores.oficinaId))
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

  const galletas = await cookies();
  const elegida = galletas.get(COOKIE_EMPRESA)?.value;
  const actual = filas.find((f) => f.empresaId === elegida) ?? (filas[0] as (typeof filas)[number]);

  const { canalId, oficinaId, canalCodigo, canalNombre, oficinaCodigo, oficinaNombre, ...datos } =
    actual;
  const alcance = actual.adminGeneral ? TODA_LA_EMPRESA : alcanceDe({ canalId, oficinaId });

  // Compra delegada: la oficina propia o, para un delegado de canal, la elegida entre las suyas.
  let oficinasCompra: OficinaCompra[] = [];
  let oficinaCompra: OficinaCompra | null = null;
  if (alcance.tipo === "oficina") {
    oficinaCompra = {
      id: alcance.oficinaId,
      etiqueta: `Oficina ${canalCodigo}-${oficinaCodigo} · ${oficinaNombre}`,
    };
  } else if (alcance.tipo === "canal" && actual.adminComercial) {
    const delCanal = await db
      .select({ id: oficinas.id, codigo: oficinas.codigo, nombre: oficinas.nombre })
      .from(oficinas)
      .where(and(eq(oficinas.canalId, alcance.canalId), eq(oficinas.activa, true)))
      .orderBy(asc(oficinas.codigo));
    oficinasCompra = delCanal.map((o) => ({
      id: o.id,
      etiqueta: `Oficina ${canalCodigo}-${o.codigo} · ${o.nombre}`,
    }));
    const preferida = galletas.get(COOKIE_OFICINA_COMPRA)?.value;
    oficinaCompra = oficinasCompra.find((o) => o.id === preferida) ?? oficinasCompra[0] ?? null;
  }

  return {
    usuarioId: sesion.user.id,
    nombreUsuario: sesion.user.name,
    email: sesion.user.email,
    ...datos,
    alcance,
    alcanceNombre:
      alcance.tipo === "oficina"
        ? `Oficina ${canalCodigo}-${oficinaCodigo} · ${oficinaNombre}`
        : alcance.tipo === "canal"
          ? `Canal ${canalCodigo} · ${canalNombre}`
          : null,
    oficinaCompra,
    oficinasCompra,
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
/** Lo que es de toda la empresa (aseguradoras, políticas, marca, oficinas): no para delegados. */
export const puedeConfigurarEmpresa = (c: ContextoCliente) =>
  puedeConfigurar(c) && c.alcance.tipo === "empresa";
/**
 * Contratar: la empresa o, en la compra delegada, una oficina. Un delegado de
 * canal compra para la oficina que elige; sin oficinas activas no compra.
 */
export const puedeContratar = (c: ContextoCliente) =>
  puedeComprar(c) && (c.alcance.tipo === "empresa" || c.oficinaCompra !== null);
/** Oficina a la que se asigna lo que se compra (`null`: toda la empresa). */
export const oficinaDeCompra = (c: ContextoCliente) => c.oficinaCompra?.id ?? null;

/** Exige permiso de configuración (páginas de usuarios, aseguradoras, productores y políticas). */
export async function requerirConfiguracion(): Promise<ContextoCliente> {
  const contexto = await requerirCliente();
  if (!puedeConfigurar(contexto)) forbidden();
  return contexto;
}

/** Exige configurar lo que es de toda la empresa (no alcanza con ser delegado). */
export async function requerirConfiguracionEmpresa(): Promise<ContextoCliente> {
  const contexto = await requerirCliente();
  if (!puedeConfigurarEmpresa(contexto)) forbidden();
  return contexto;
}

/** Exige poder contratar paquetes (carrito y checkout). */
export async function requerirContratacion(): Promise<ContextoCliente> {
  const contexto = await requerirCliente();
  if (!puedeContratar(contexto)) forbidden();
  return contexto;
}

/** Exige permiso comercial (carrito y órdenes de la empresa). */
export async function requerirComercial(): Promise<ContextoCliente> {
  const contexto = await requerirCliente();
  if (!puedeComprar(contexto)) forbidden();
  return contexto;
}
