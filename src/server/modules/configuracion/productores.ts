import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { type Alcance, abarcaOficina, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import { esCuitValido, normalizarCuit } from "@/domain/cuentas/cuit";
import { CONDICIONES_IVA } from "@/domain/facturacion/impuestos";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { oficinaEnAlcance } from "../cuentas/alcance";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { usoDeLimites } from "./limites";

const FUNCION_INSTITORIO = "prodigal.institorio";

/** Productor de la empresa visible para el alcance (un delegado ve los de sus oficinas). */
const delAlcance = (empresaId: string, alcance: Alcance) =>
  and(eq(t.productores.empresaId, empresaId), oficinaEnAlcance(t.productores.oficinaId, alcance));

export async function listarProductores(
  db: Ejecutor,
  empresaId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  return db
    .select({
      id: t.productores.id,
      nombre: t.productores.nombre,
      matricula: t.productores.matricula,
      cuit: t.productores.cuit,
      email: t.productores.email,
      esProductor: t.productores.esProductor,
      esOrganizador: t.productores.esOrganizador,
      esSubproductor: t.productores.esSubproductor,
      agenteInstitorio: t.productores.agenteInstitorio,
      activo: t.productores.activo,
      oficinaCodigo: sql<
        string | null
      >`(select c.codigo || '-' || o.codigo from ${t.oficinas} o join ${t.canales} c on c.id = o.canal_id where o.id = "productores"."oficina_id")`,
      codigos: sql<number>`(select count(*)::int from ${t.productorCodigos} pc where pc.productor_id = "productores"."id" and pc.activo)`,
    })
    .from(t.productores)
    .where(delAlcance(empresaId, alcance))
    .orderBy(sql`${t.productores.activo} desc`, asc(t.productores.nombre));
}

export async function obtenerProductor(
  db: Ejecutor,
  empresaId: string,
  id: string,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  const productor = await db.query.productores.findFirst({
    where: and(eq(t.productores.id, id), delAlcance(empresaId, alcance)),
  });
  if (!productor) return undefined;
  const codigos = await db
    .select({
      id: t.productorCodigos.id,
      aseguradoraId: t.productorCodigos.aseguradoraId,
      aseguradora: t.aseguradoras.nombre,
      abreviatura: t.aseguradoras.abreviatura,
      codigo: t.productorCodigos.codigo,
      rol: t.productorCodigos.rol,
    })
    .from(t.productorCodigos)
    .innerJoin(t.aseguradoras, eq(t.aseguradoras.id, t.productorCodigos.aseguradoraId))
    .where(and(eq(t.productorCodigos.productorId, id), eq(t.productorCodigos.activo, true)))
    .orderBy(asc(t.aseguradoras.nombre), asc(t.productorCodigos.codigo));
  return { ...productor, codigos };
}

const opcional = (max: number) => z.string().trim().max(max).optional();

export const esquemaProductor = z
  .object({
    id: z.uuid().optional(),
    nombre: z.string().trim().min(2, { error: "Ingresá el nombre" }).max(120),
    matricula: opcional(20),
    tipoPersona: z.enum(["FISICA", "JURIDICA"]).optional(),
    cuit: z
      .string()
      .trim()
      .refine(esCuitValido, { error: "El CUIT no es válido" })
      .transform(normalizarCuit)
      .optional(),
    condicionIva: z.enum(CONDICIONES_IVA).optional(),
    email: z.email({ error: "Ingresá un mail válido" }).trim().toLowerCase().max(160).optional(),
    telefono: opcional(30),
    celular: opcional(30),
    domicilio: opcional(160),
    oficinaId: z.uuid().optional(),
    esProductor: z.boolean(),
    esOrganizador: z.boolean(),
    esSubproductor: z.boolean(),
    agenteInstitorio: z.boolean(),
  })
  .refine((p) => p.esProductor || p.esOrganizador || p.esSubproductor, {
    path: ["roles"],
    error: "Marcá al menos un rol",
  });

export type EntradaProductor = z.infer<typeof esquemaProductor>;

export type ErrorProductor = "NO_EXISTE" | "OFICINA_INVALIDA" | "CUIT_DUPLICADO" | "SIN_INSTITORIO";

export async function guardarProductor(
  db: Db,
  empresaId: string,
  entrada: EntradaProductor,
  actorId: string,
  hoy: Fecha = hoyArgentina(),
  alcance: Alcance = TODA_LA_EMPRESA,
): Promise<{ ok: true; id: string } | { ok: false; error: ErrorProductor }> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: t.empresas.id })
      .from(t.empresas)
      .where(eq(t.empresas.id, empresaId))
      .for("update");
    const antes = entrada.id
      ? await tx.query.productores.findFirst({
          where: and(eq(t.productores.id, entrada.id), delAlcance(empresaId, alcance)),
        })
      : undefined;
    if (entrada.id && !antes) return { ok: false, error: "NO_EXISTE" };

    // Un delegado asigna el productor a una de sus oficinas (sin oficina es de toda la empresa).
    const oficina = entrada.oficinaId
      ? await tx.query.oficinas.findFirst({
          columns: { id: true, canalId: true },
          where: and(eq(t.oficinas.id, entrada.oficinaId), eq(t.oficinas.empresaId, empresaId)),
        })
      : null;
    if ((entrada.oficinaId && !oficina) || !abarcaOficina(alcance, oficina ?? null)) {
      return { ok: false, error: "OFICINA_INVALIDA" };
    }
    if (entrada.cuit) {
      const repetido = await tx.query.productores.findFirst({
        columns: { id: true },
        where: and(
          eq(t.productores.empresaId, empresaId),
          eq(t.productores.cuit, entrada.cuit),
          antes ? ne(t.productores.id, antes.id) : undefined,
        ),
      });
      if (repetido) return { ok: false, error: "CUIT_DUPLICADO" };
    }
    // Agente institorio: función de la licencia, se controla al activarla.
    if (entrada.agenteInstitorio && !antes?.agenteInstitorio) {
      const { funciones } = await usoDeLimites(tx, empresaId, hoy);
      if (!funciones.has(FUNCION_INSTITORIO)) return { ok: false, error: "SIN_INSTITORIO" };
    }

    const valores = {
      nombre: entrada.nombre,
      matricula: entrada.matricula || null,
      tipoPersona: entrada.tipoPersona ?? null,
      cuit: entrada.cuit ?? null,
      condicionIva: entrada.condicionIva ?? null,
      email: entrada.email ?? null,
      telefono: entrada.telefono || null,
      celular: entrada.celular || null,
      domicilio: entrada.domicilio || null,
      oficinaId: entrada.oficinaId ?? null,
      esProductor: entrada.esProductor,
      esOrganizador: entrada.esOrganizador,
      esSubproductor: entrada.esSubproductor,
      agenteInstitorio: entrada.agenteInstitorio,
    };
    let id: string;
    if (antes) {
      await tx.update(t.productores).set(valores).where(eq(t.productores.id, antes.id));
      id = antes.id;
    } else {
      const [creado] = await tx
        .insert(t.productores)
        .values({ empresaId, ...valores })
        .returning({ id: t.productores.id });
      id = creado?.id ?? "";
    }
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "productor",
      empresaId: empresaId,
      entidadId: id,
      accion: antes ? "modificacion" : "alta",
      antes,
      despues: { empresaId, ...valores },
    });
    return { ok: true, id };
  });
}

export async function cambiarEstadoProductor(
  db: Db,
  empresaId: string,
  id: string,
  activo: boolean,
  actorId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [actualizado] = await tx
      .update(t.productores)
      .set({ activo })
      .where(and(eq(t.productores.id, id), delAlcance(empresaId, alcance)))
      .returning({ id: t.productores.id });
    if (!actualizado) return false;
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "productor",
      empresaId: empresaId,
      entidadId: id,
      accion: activo ? "reactivacion" : "baja",
    });
    return true;
  });
}

export const esquemaCodigo = z.object({
  productorId: z.uuid(),
  aseguradoraId: z.uuid({ error: "Elegí la aseguradora" }),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, { error: "Ingresá el código" })
    .max(20)
    .regex(/^[A-Z0-9./-]+$/, { error: "Solo letras, números, punto, barra o guion" }),
  rol: z.enum(["PRODUCTOR", "ORGANIZADOR"]),
});

export type EntradaCodigo = z.infer<typeof esquemaCodigo>;

export type ErrorCodigo = "NO_EXISTE" | "NO_TRABAJA" | "DUPLICADO" | "ROL_INVALIDO";

/**
 * Código del productor en una aseguradora con la que trabaja la empresa. El
 * rol en la aseguradora tiene que ser uno de los roles del productor.
 */
export async function agregarCodigo(
  db: Db,
  empresaId: string,
  entrada: EntradaCodigo,
  actorId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
): Promise<{ ok: true } | { ok: false; error: ErrorCodigo }> {
  return db.transaction(async (tx) => {
    const productor = await tx.query.productores.findFirst({
      where: and(eq(t.productores.id, entrada.productorId), delAlcance(empresaId, alcance)),
    });
    if (!productor) return { ok: false, error: "NO_EXISTE" };
    const rolValido =
      entrada.rol === "ORGANIZADOR"
        ? productor.esOrganizador
        : productor.esProductor || productor.esSubproductor;
    if (!rolValido) return { ok: false, error: "ROL_INVALIDO" };
    const trabaja = await tx.query.empresaAseguradoras.findFirst({
      where: and(
        eq(t.empresaAseguradoras.empresaId, empresaId),
        eq(t.empresaAseguradoras.aseguradoraId, entrada.aseguradoraId),
        eq(t.empresaAseguradoras.activa, true),
      ),
    });
    if (!trabaja) return { ok: false, error: "NO_TRABAJA" };

    const [creado] = await tx
      .insert(t.productorCodigos)
      .values({
        productorId: productor.id,
        aseguradoraId: entrada.aseguradoraId,
        codigo: entrada.codigo,
        rol: entrada.rol,
      })
      .onConflictDoUpdate({
        target: [
          t.productorCodigos.productorId,
          t.productorCodigos.aseguradoraId,
          t.productorCodigos.codigo,
        ],
        set: { activo: true, rol: entrada.rol },
        // Solo "revive" un código dado de baja; uno activo es un duplicado.
        setWhere: eq(t.productorCodigos.activo, false),
      })
      .returning({ id: t.productorCodigos.id });
    if (!creado) return { ok: false, error: "DUPLICADO" };

    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "productor",
      empresaId: empresaId,
      entidadId: productor.id,
      accion: "codigo_alta",
      despues: { aseguradoraId: entrada.aseguradoraId, codigo: entrada.codigo, rol: entrada.rol },
    });
    return { ok: true };
  });
}

export async function quitarCodigo(
  db: Db,
  empresaId: string,
  codigoId: string,
  actorId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [fila] = await tx
      .select({
        id: t.productorCodigos.id,
        productorId: t.productorCodigos.productorId,
        aseguradoraId: t.productorCodigos.aseguradoraId,
        codigo: t.productorCodigos.codigo,
      })
      .from(t.productorCodigos)
      .innerJoin(t.productores, eq(t.productores.id, t.productorCodigos.productorId))
      .where(and(eq(t.productorCodigos.id, codigoId), delAlcance(empresaId, alcance)));
    if (!fila) return false;
    await tx
      .update(t.productorCodigos)
      .set({ activo: false })
      .where(eq(t.productorCodigos.id, fila.id));
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "productor",
      empresaId: empresaId,
      entidadId: fila.productorId,
      accion: "codigo_baja",
      antes: { aseguradoraId: fila.aseguradoraId, codigo: fila.codigo },
    });
    return true;
  });
}
