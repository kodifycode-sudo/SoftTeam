import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { interfazVigente } from "@/domain/cuentas/limites";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { POLITICAS_POR_DEFECTO } from "@/server/db/schema/configuracion";
import { leerMarca, marcaParaApi } from "../configuracion/marca";
import { licenciaDeEmpresa } from "../licencias/licencia-empresa";

/*
 * Datos que expone la API a los productos. Las formas son un contrato
 * público versionado ("v1"): si hay que cambiarlas, se agrega una v2.
 */

/** Productos con contratos vigentes, por empresa (para el listado de sincronización). */
async function productosVigentesPorEmpresa(db: Ejecutor, empresaIds: string[], hoy: Fecha) {
  if (empresaIds.length === 0) return new Map<string, string[]>();
  const filas = await db
    .selectDistinct({ empresaId: t.contratos.empresaId, productoId: t.recursos.productoId })
    .from(t.contratos)
    .innerJoin(t.contratoRecursos, eq(t.contratoRecursos.contratoId, t.contratos.id))
    .innerJoin(t.recursos, eq(t.recursos.id, t.contratoRecursos.recursoId))
    .where(
      and(
        inArray(t.contratos.empresaId, empresaIds),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        sql`${t.contratos.desde} <= ${hoy}`,
        or(isNull(t.contratos.hasta), gte(t.contratos.hasta, hoy)),
        sql`${t.contratoRecursos.cantidad} > 0`,
      ),
    );
  const mapa = new Map<string, string[]>();
  for (const f of filas) mapa.set(f.empresaId, [...(mapa.get(f.empresaId) ?? []), f.productoId]);
  return mapa;
}

/**
 * Empresas para sincronizar: todas, o las modificadas desde una fecha y hora
 * (incluye las desactivadas: el cambio pudo ser justamente la baja).
 */
export async function listarEmpresasParaSincronizar(
  db: Ejecutor,
  filtros: { modificadasDesde?: Date | undefined; soloActivas?: boolean },
  hoy: Fecha = hoyArgentina(),
) {
  const empresas = await db
    .select({
      id: t.empresas.id,
      numero: t.empresas.numero,
      nombre: t.empresas.nombre,
      activa: t.empresas.activa,
      modificadaEn: t.empresas.modificadaEn,
    })
    .from(t.empresas)
    .where(
      and(
        filtros.modificadasDesde
          ? gte(t.empresas.modificadaEn, filtros.modificadasDesde)
          : undefined,
        filtros.soloActivas ? eq(t.empresas.activa, true) : undefined,
      ),
    )
    .orderBy(asc(t.empresas.modificadaEn))
    .limit(1000);
  const productos = await productosVigentesPorEmpresa(
    db,
    empresas.map((e) => e.id),
    hoy,
  );
  return empresas.map((e) => ({
    numero: e.numero,
    nombre: e.nombre,
    activa: e.activa,
    productos: productos.get(e.id)?.sort() ?? [],
    modificadaEn: e.modificadaEn.toISOString(),
  }));
}

/** Código de oficina completo "CCOOO". */
const codigoOficina = (canal: string, oficina: string) => `${canal}${oficina}`;

/** Estructura completa de una empresa (contrato `EmpresaFull` v1). */
export async function empresaCompleta(db: Ejecutor, numero: number, hoy: Fecha = hoyArgentina()) {
  const empresa = await db.query.empresas.findFirst({ where: eq(t.empresas.numero, numero) });
  if (!empresa) return undefined;

  const [oficinas, colaboradores, aseguradoras, productores, codigos, politicas, marca] =
    await Promise.all([
      db
        .select({
          id: t.oficinas.id,
          canal: t.canales.codigo,
          canalNombre: t.canales.nombre,
          codigo: t.oficinas.codigo,
          nombre: t.oficinas.nombre,
          telefono: t.oficinas.telefono,
          whatsapp: t.oficinas.whatsapp,
          domicilio: t.oficinas.domicilio,
          notifica: t.oficinas.notifica,
          activa: t.oficinas.activa,
        })
        .from(t.oficinas)
        .innerJoin(t.canales, eq(t.canales.id, t.oficinas.canalId))
        .where(eq(t.oficinas.empresaId, empresa.id))
        .orderBy(asc(t.canales.codigo), asc(t.oficinas.codigo)),
      db
        .select({
          id: t.colaboradores.id,
          nombre: t.colaboradores.nombre,
          email: t.colaboradores.email,
          telefono: t.colaboradores.telefono,
          canalId: t.colaboradores.canalId,
          oficinaId: t.colaboradores.oficinaId,
          usuarioProdigal: t.colaboradores.usuarioProdigal,
          accesoProdigal: t.colaboradores.accesoProdigal,
          accesoCotiweb: t.colaboradores.accesoCotiweb,
          accesoBienseguro: t.colaboradores.accesoBienseguro,
          accesoBoletin: t.colaboradores.accesoBoletin,
          activo: t.colaboradores.activo,
        })
        .from(t.colaboradores)
        .where(eq(t.colaboradores.empresaId, empresa.id))
        .orderBy(asc(t.colaboradores.nombre)),
      db
        .select({
          codigoLegal: t.aseguradoras.codigoLegal,
          abreviatura: t.aseguradoras.abreviatura,
          nombre: t.aseguradoras.nombre,
          activa: t.empresaAseguradoras.activa,
          interfazProdigal: t.empresaAseguradoras.interfazProdigal,
          interfazProdigalBajaDesde: t.empresaAseguradoras.interfazProdigalBajaDesde,
          interfazCotiweb: t.empresaAseguradoras.interfazCotiweb,
          interfazCotiwebBajaDesde: t.empresaAseguradoras.interfazCotiwebBajaDesde,
        })
        .from(t.empresaAseguradoras)
        .innerJoin(t.aseguradoras, eq(t.aseguradoras.id, t.empresaAseguradoras.aseguradoraId))
        .where(eq(t.empresaAseguradoras.empresaId, empresa.id))
        .orderBy(asc(t.aseguradoras.nombre)),
      db
        .select()
        .from(t.productores)
        .where(eq(t.productores.empresaId, empresa.id))
        .orderBy(asc(t.productores.nombre)),
      db
        .select({
          productorId: t.productorCodigos.productorId,
          aseguradora: t.aseguradoras.abreviatura,
          codigo: t.productorCodigos.codigo,
          rol: t.productorCodigos.rol,
          activo: t.productorCodigos.activo,
        })
        .from(t.productorCodigos)
        .innerJoin(t.productores, eq(t.productores.id, t.productorCodigos.productorId))
        .innerJoin(t.aseguradoras, eq(t.aseguradoras.id, t.productorCodigos.aseguradoraId))
        .where(eq(t.productores.empresaId, empresa.id)),
      db.query.politicasEmpresa.findFirst({ where: eq(t.politicasEmpresa.empresaId, empresa.id) }),
      leerMarca(db, empresa.id),
    ]);

  const oficinaPorId = new Map(oficinas.map((o) => [o.id, codigoOficina(o.canal, o.codigo)]));
  const canales = await db
    .select({
      id: t.canales.id,
      codigo: t.canales.codigo,
      nombre: t.canales.nombre,
      activo: t.canales.activo,
    })
    .from(t.canales)
    .where(eq(t.canales.empresaId, empresa.id))
    .orderBy(asc(t.canales.codigo));
  const canalPorId = new Map(canales.map((c) => [c.id, c.codigo]));

  return {
    version: "EmpresaFull_V1" as const,
    empresa: {
      numero: empresa.numero,
      nombre: empresa.nombre,
      nombreCorto: empresa.nombreCorto,
      pais: empresa.paisId,
      tipoInstalacion: empresa.tipoInstalacion,
      activa: empresa.activa,
      modificadaEn: empresa.modificadaEn.toISOString(),
    },
    canales: canales.map(({ codigo, nombre, activo }) => ({ codigo, nombre, activo })),
    oficinas: oficinas.map((o) => ({
      codigo: codigoOficina(o.canal, o.codigo),
      canal: o.canal,
      nombre: o.nombre,
      telefono: o.telefono,
      whatsapp: o.whatsapp,
      domicilio: o.domicilio,
      // La política de la empresa manda: si las oficinas no notifican, ninguna lo hace.
      notifica: o.notifica && (politicas?.politicas ?? POLITICAS_POR_DEFECTO).oficinasNotifican,
      activa: o.activa,
    })),
    usuarios: colaboradores.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      email: c.email,
      telefono: c.telefono,
      // Alcance: oficina ("CCOOO"), canal ("CC999") o toda la empresa (null).
      alcance: c.oficinaId
        ? (oficinaPorId.get(c.oficinaId) ?? null)
        : c.canalId
          ? `${canalPorId.get(c.canalId)}999`
          : null,
      usuarioProdigal: c.usuarioProdigal,
      accesos: {
        prodigal: c.accesoProdigal,
        cotiweb: c.accesoCotiweb,
        bienseguro: c.accesoBienseguro,
        boletin: c.accesoBoletin,
      },
      activo: c.activo,
    })),
    // Interfaces vigentes hoy: una baja programada rige recién el mes siguiente.
    aseguradoras: aseguradoras.map((a) => ({
      codigoLegal: a.codigoLegal,
      abreviatura: a.abreviatura,
      nombre: a.nombre,
      activa: a.activa,
      interfazProdigal: interfazVigente(
        a.interfazProdigal,
        a.interfazProdigalBajaDesde as Fecha | null,
        hoy,
      ),
      interfazCotiweb: interfazVigente(
        a.interfazCotiweb,
        a.interfazCotiwebBajaDesde as Fecha | null,
        hoy,
      ),
    })),
    productores: productores.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      matricula: p.matricula,
      cuit: p.cuit,
      oficina: p.oficinaId ? (oficinaPorId.get(p.oficinaId) ?? null) : null,
      roles: {
        productor: p.esProductor,
        organizador: p.esOrganizador,
        subproductor: p.esSubproductor,
      },
      agenteInstitorio: p.agenteInstitorio,
      activo: p.activo,
      codigos: codigos
        .filter((c) => c.productorId === p.id)
        .map(({ aseguradora, codigo, rol, activo }) => ({ aseguradora, codigo, rol, activo })),
    })),
    politicas: politicas?.politicas ?? POLITICAS_POR_DEFECTO,
    // Marca blanca: cómo se muestra la empresa ante sus asegurados.
    marca: marcaParaApi(marca, `/api/v1/empresas/${empresa.numero}/logo`),
  };
}

/** Licencia vigente de una empresa en el formato de la API. */
export async function licenciaParaApi(db: Ejecutor, numero: number, hoy: Fecha = hoyArgentina()) {
  const empresa = await db.query.empresas.findFirst({
    columns: { id: true, numero: true, nombre: true, activa: true },
    where: eq(t.empresas.numero, numero),
  });
  if (!empresa) return undefined;
  // Una empresa desactivada no tiene licencia, aunque tenga contratos.
  const licencia = empresa.activa ? await licenciaDeEmpresa(db, empresa.id, hoy) : undefined;

  const proximoVencimiento =
    licencia?.contratosVigentes
      .map((c) => c.hasta)
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .sort()[0] ?? null;

  return {
    empresa: empresa.numero,
    nombre: empresa.nombre,
    activa: empresa.activa,
    fecha: hoy,
    proximoVencimiento,
    productos: Object.fromEntries(
      (licencia?.productos ?? []).map((p) => [
        p.productoId,
        Object.fromEntries(
          p.items.map((i) => [
            i.recursoId.slice(p.productoId.length + 1),
            i.clase === "FUNCION"
              ? i.total > 0
              : i.disponible === null
                ? i.total
                : { total: i.total, disponible: i.disponible },
          ]),
        ),
      ]),
    ),
  };
}
