import { and, asc, eq, sql } from "drizzle-orm";
import { type Alcance, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import type { Columna } from "@/domain/exportacion/csv";
import type { Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { oficinaEnAlcance } from "../cuentas/alcance";

/*
 * Exportaciones del portal con los mismos títulos que la importación de
 * SOFTeam: el archivo sirve de respaldo y se puede volver a importar.
 */

const codigoOficina = (columna: "colaboradores" | "productores") =>
  sql<
    string | null
  >`(select c.codigo || '-' || o.codigo from ${t.oficinas} o join ${t.canales} c on c.id = o.canal_id where o.id = ${sql.raw(`"${columna}"."oficina_id"`)})`;

export async function usuariosParaExportar(
  db: Ejecutor,
  empresaId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  return db
    .select({
      nombre: t.colaboradores.nombre,
      email: t.colaboradores.email,
      iniciales: t.colaboradores.iniciales,
      oficina: codigoOficina("colaboradores"),
      adminGeneral: t.colaboradores.adminGeneral,
      adminComercial: t.colaboradores.adminComercial,
      adminOperativo: t.colaboradores.adminOperativo,
      prodigal: t.colaboradores.accesoProdigal,
      cotiweb: t.colaboradores.accesoCotiweb,
      bienseguro: t.colaboradores.accesoBienseguro,
      boletin: t.colaboradores.accesoBoletin,
      usuarioProdigal: t.colaboradores.usuarioProdigal,
      activo: t.colaboradores.activo,
    })
    .from(t.colaboradores)
    .where(
      and(
        eq(t.colaboradores.empresaId, empresaId),
        oficinaEnAlcance(t.colaboradores.oficinaId, alcance),
      ),
    )
    .orderBy(asc(t.colaboradores.nombre));
}

export const columnasUsuarios = (
  empresaNumero: number,
): Columna<Awaited<ReturnType<typeof usuariosParaExportar>>[number]>[] => [
  { titulo: "Número de empresa", valor: () => empresaNumero },
  { titulo: "Nombre", valor: (f) => f.nombre },
  { titulo: "Mail", valor: (f) => f.email },
  { titulo: "Iniciales", valor: (f) => f.iniciales },
  { titulo: "Oficina", valor: (f) => f.oficina },
  { titulo: "Administrador general", valor: (f) => f.adminGeneral },
  { titulo: "Administrador comercial", valor: (f) => f.adminComercial },
  { titulo: "Administrador operativo", valor: (f) => f.adminOperativo },
  { titulo: "Acceso a Prodigal", valor: (f) => f.prodigal },
  { titulo: "Acceso a CotiWeb", valor: (f) => f.cotiweb },
  { titulo: "Acceso a BienSeguro", valor: (f) => f.bienseguro },
  { titulo: "Acceso al Boletín", valor: (f) => f.boletin },
  { titulo: "Usuario en Prodigal", valor: (f) => f.usuarioProdigal },
  { titulo: "Dado de baja", valor: (f) => !f.activo },
];

export async function productoresParaExportar(
  db: Ejecutor,
  empresaId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  return db
    .select({
      idAnterior: t.productores.idAnterior,
      nombre: t.productores.nombre,
      matricula: t.productores.matricula,
      tipoPersona: t.productores.tipoPersona,
      cuit: t.productores.cuit,
      condicionIva: t.condicionesIva.nombre,
      email: t.productores.email,
      telefono: t.productores.telefono,
      celular: t.productores.celular,
      domicilio: t.productores.domicilio,
      oficina: codigoOficina("productores"),
      institorio: t.productores.agenteInstitorio,
      productor: t.productores.esProductor,
      organizador: t.productores.esOrganizador,
      subproductor: t.productores.esSubproductor,
      activo: t.productores.activo,
    })
    .from(t.productores)
    .leftJoin(t.condicionesIva, eq(t.condicionesIva.codigo, t.productores.condicionIva))
    .where(
      and(
        eq(t.productores.empresaId, empresaId),
        oficinaEnAlcance(t.productores.oficinaId, alcance),
      ),
    )
    .orderBy(asc(t.productores.nombre));
}

export const columnasProductores = (
  empresaNumero: number,
): Columna<Awaited<ReturnType<typeof productoresParaExportar>>[number]>[] => [
  { titulo: "Número de empresa", valor: () => empresaNumero },
  { titulo: "Id del productor", valor: (f) => f.idAnterior },
  { titulo: "Nombre", valor: (f) => f.nombre },
  { titulo: "Matrícula", valor: (f) => f.matricula },
  {
    titulo: "Tipo de persona",
    valor: (f) => (f.tipoPersona ? (f.tipoPersona === "FISICA" ? "Física" : "Jurídica") : null),
  },
  { titulo: "CUIT", valor: (f) => f.cuit },
  {
    titulo: "Condición de IVA",
    valor: (f) => f.condicionIva,
  },
  { titulo: "Mail", valor: (f) => f.email },
  { titulo: "Teléfono", valor: (f) => f.telefono },
  { titulo: "Celular", valor: (f) => f.celular },
  { titulo: "Domicilio", valor: (f) => f.domicilio },
  { titulo: "Oficina", valor: (f) => f.oficina },
  { titulo: "Agente institorio", valor: (f) => f.institorio },
  { titulo: "Es productor", valor: (f) => f.productor },
  { titulo: "Es organizador", valor: (f) => f.organizador },
  { titulo: "Es subproductor", valor: (f) => f.subproductor },
  { titulo: "Dado de baja", valor: (f) => !f.activo },
];

/** Códigos de productor por compañía, uno por fila (el productor, por CUIT, id anterior o nombre). */
export async function codigosParaExportar(
  db: Ejecutor,
  empresaId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  return db
    .select({
      productor: sql<string>`coalesce(${t.productores.cuit}, ${t.productores.idAnterior}, ${t.productores.nombre})`,
      productorNombre: t.productores.nombre,
      aseguradora: t.aseguradoras.abreviatura,
      aseguradoraNombre: t.aseguradoras.nombre,
      codigo: t.productorCodigos.codigo,
      rol: t.productorCodigos.rol,
      activo: t.productorCodigos.activo,
    })
    .from(t.productorCodigos)
    .innerJoin(t.productores, eq(t.productores.id, t.productorCodigos.productorId))
    .innerJoin(t.aseguradoras, eq(t.aseguradoras.id, t.productorCodigos.aseguradoraId))
    .where(
      and(
        eq(t.productores.empresaId, empresaId),
        oficinaEnAlcance(t.productores.oficinaId, alcance),
      ),
    )
    .orderBy(asc(t.productores.nombre), asc(t.aseguradoras.nombre), asc(t.productorCodigos.codigo));
}

export const columnasCodigos = (
  empresaNumero: number,
): Columna<Awaited<ReturnType<typeof codigosParaExportar>>[number]>[] => [
  { titulo: "Número de empresa", valor: () => empresaNumero },
  { titulo: "Productor", valor: (f) => f.productor },
  { titulo: "Nombre del productor", valor: (f) => f.productorNombre },
  { titulo: "Aseguradora", valor: (f) => f.aseguradora },
  { titulo: "Nombre de la aseguradora", valor: (f) => f.aseguradoraNombre },
  { titulo: "Código", valor: (f) => f.codigo },
  { titulo: "Como organizador", valor: (f) => f.rol === "ORGANIZADOR" },
  { titulo: "Dado de baja", valor: (f) => !f.activo },
];
