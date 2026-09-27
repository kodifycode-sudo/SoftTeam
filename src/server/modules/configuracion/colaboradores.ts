import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { type Alcance, abarca, alcanceDe, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import {
  type ErrorLimite,
  type ErrorPermisos,
  PRODUCTOS_CON_ACCESO,
  type ProductoAcceso,
  puedeActivar,
  tienePermisos,
  validarCambioColaborador,
} from "@/domain/cuentas/limites";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { colaboradorEnAlcance } from "../cuentas/alcance";
import { asegurarUsuario, normalizarEmail, type UsuarioLogin } from "../cuentas/usuarios";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { COLUMNA_ACCESO, usoDeLimites } from "./limites";

/** Colaboradores de la empresa (o solo los del alcance de un delegado). */
export async function listarColaboradores(
  db: Ejecutor,
  empresaId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  return db
    .select({
      id: t.colaboradores.id,
      nombre: t.colaboradores.nombre,
      iniciales: t.colaboradores.iniciales,
      email: t.colaboradores.email,
      telefono: t.colaboradores.telefono,
      canalId: t.colaboradores.canalId,
      oficinaId: t.colaboradores.oficinaId,
      canalCodigo: t.canales.codigo,
      canalNombre: t.canales.nombre,
      oficinaCodigo: sql<
        string | null
      >`(select c.codigo || '-' || o.codigo from ${t.oficinas} o join ${t.canales} c on c.id = o.canal_id where o.id = "colaboradores"."oficina_id")`,
      oficinaNombre: sql<
        string | null
      >`(select o.nombre from ${t.oficinas} o where o.id = "colaboradores"."oficina_id")`,
      adminGeneral: t.colaboradores.adminGeneral,
      adminComercial: t.colaboradores.adminComercial,
      adminOperativo: t.colaboradores.adminOperativo,
      accesoProdigal: t.colaboradores.accesoProdigal,
      accesoCotiweb: t.colaboradores.accesoCotiweb,
      accesoBienseguro: t.colaboradores.accesoBienseguro,
      accesoBoletin: t.colaboradores.accesoBoletin,
      usuarioProdigal: t.colaboradores.usuarioProdigal,
      activo: t.colaboradores.activo,
      usuarioId: t.colaboradores.usuarioId,
      usuarioVerificado: t.usuarios.emailVerified,
    })
    .from(t.colaboradores)
    .leftJoin(t.canales, eq(t.canales.id, t.colaboradores.canalId))
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.colaboradores.usuarioId))
    .where(and(eq(t.colaboradores.empresaId, empresaId), colaboradorEnAlcance(alcance)))
    .orderBy(sql`${t.colaboradores.activo} desc`, asc(t.colaboradores.nombre));
}

export type Colaborador = Awaited<ReturnType<typeof listarColaboradores>>[number];

const opcional = (max: number) => z.string().trim().max(max).optional();

export const esquemaColaborador = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre" }).max(120),
  iniciales: opcional(5),
  email: z.email({ error: "Ingresá un mail válido" }).trim().toLowerCase().max(160),
  telefono: opcional(30),
  /** "empresa", "canal:<id>" u "oficina:<id>". */
  alcance: z
    .string()
    .regex(/^(empresa|canal:[0-9a-f-]{36}|oficina:[0-9a-f-]{36})$/, { error: "Elegí el alcance" }),
  adminGeneral: z.boolean(),
  adminComercial: z.boolean(),
  adminOperativo: z.boolean(),
  accesoProdigal: z.boolean(),
  accesoCotiweb: z.boolean(),
  accesoBienseguro: z.boolean(),
  accesoBoletin: z.boolean(),
  usuarioProdigal: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9._-]{1,20}$/, { error: "Hasta 20 letras, números, punto o guion" })
    .optional(),
});

export type EntradaColaborador = z.infer<typeof esquemaColaborador>;

/** Quién hace el cambio (del contexto del portal). */
export interface Actor {
  usuarioId: string;
  colaboradorId: string;
  adminGeneral: boolean;
  adminComercial: boolean;
  adminOperativo: boolean;
  /** Un delegado solo ve y gestiona colaboradores de su canal u oficina. */
  alcance: Alcance;
}

export type ErrorColaborador =
  | ErrorPermisos
  | ErrorLimite
  | "NO_EXISTE"
  | "ALCANCE_INVALIDO"
  | "GENERAL_TODA_LA_EMPRESA"
  | "EMAIL_DUPLICADO"
  | "PRODIGAL_DUPLICADO"
  | "ES_SOFTEAM";

export type ResultadoColaborador =
  | {
      ok: true;
      id: string;
      /** Usuario al que hay que avisarle que puede administrar la cuenta. */
      invitar?: UsuarioLogin;
    }
  | { ok: false; error: ErrorColaborador; producto?: ProductoAcceso; detalle?: string };

type Fila = typeof t.colaboradores.$inferSelect;
type Cambios = Pick<
  Fila,
  | "nombre"
  | "iniciales"
  | "email"
  | "telefono"
  | "canalId"
  | "oficinaId"
  | "adminGeneral"
  | "adminComercial"
  | "adminOperativo"
  | "accesoProdigal"
  | "accesoCotiweb"
  | "accesoBienseguro"
  | "accesoBoletin"
  | "usuarioProdigal"
  | "activo"
>;

async function resolverAlcance(tx: Ejecutor, empresaId: string, alcance: string) {
  const [tipo, id] = alcance.split(":");
  if (tipo === "empresa" || !id) return { canalId: null, oficinaId: null };
  if (tipo === "canal") {
    const canal = await tx.query.canales.findFirst({
      columns: { id: true },
      where: and(eq(t.canales.id, id), eq(t.canales.empresaId, empresaId)),
    });
    return canal ? { canalId: canal.id, oficinaId: null } : undefined;
  }
  const oficina = await tx.query.oficinas.findFirst({
    columns: { id: true, canalId: true },
    where: and(eq(t.oficinas.id, id), eq(t.oficinas.empresaId, empresaId)),
  });
  return oficina ? { canalId: oficina.canalId, oficinaId: oficina.id } : undefined;
}

/**
 * Aplica un alta o modificación ya resuelta, con todas las reglas: permisos
 * (quién puede dar o quitar administración), límites de la licencia al
 * activar accesos y unicidad. Corre en una transacción que bloquea la empresa.
 */
async function aplicar(
  tx: Ejecutor,
  empresaId: string,
  antes: Fila | undefined,
  despues: Cambios,
  actor: Actor,
  hoy: Fecha,
): Promise<ResultadoColaborador> {
  const [{ generales } = { generales: 0 }] = await tx
    .select({ generales: sql<number>`count(*)::int` })
    .from(t.colaboradores)
    .where(
      and(
        eq(t.colaboradores.empresaId, empresaId),
        eq(t.colaboradores.activo, true),
        eq(t.colaboradores.adminGeneral, true),
      ),
    );
  const permisos = validarCambioColaborador({
    actor: { ...actor },
    colaboradorId: antes?.id ?? null,
    antes: antes ?? null,
    despues,
    adminsGenerales: generales,
  });
  if (!permisos.ok) return { ok: false, error: permisos.error };

  const duplicado = await tx.query.colaboradores.findFirst({
    columns: { id: true },
    where: and(
      eq(t.colaboradores.empresaId, empresaId),
      sql`lower(${t.colaboradores.email}) = ${despues.email}`,
      antes ? ne(t.colaboradores.id, antes.id) : undefined,
    ),
  });
  if (duplicado) return { ok: false, error: "EMAIL_DUPLICADO" };

  if (despues.usuarioProdigal) {
    const enUso = await tx.query.colaboradores.findFirst({
      columns: { id: true },
      where: and(
        eq(t.colaboradores.usuarioProdigal, despues.usuarioProdigal),
        antes ? ne(t.colaboradores.id, antes.id) : undefined,
      ),
    });
    if (enUso) return { ok: false, error: "PRODIGAL_DUPLICADO" };
  }

  // Límites: solo al activar un acceso que no tenía (4.5).
  if (despues.activo) {
    const nuevos = PRODUCTOS_CON_ACCESO.filter(
      (p) => despues[COLUMNA_ACCESO[p]] && !(antes?.activo && antes[COLUMNA_ACCESO[p]]),
    );
    if (nuevos.length > 0) {
      const uso = await usoDeLimites(tx, empresaId, hoy);
      for (const producto of nuevos) {
        const u = uso.usuarios[producto];
        const control = puedeActivar(u, u.licenciado);
        if (!control.ok) {
          return {
            ok: false,
            error: control.error,
            producto,
            ...(control.detalle ? { detalle: control.detalle } : {}),
          };
        }
      }
    }
  }

  // Un administrador necesita un usuario de login con su mail.
  const emailCambio = antes && normalizarEmail(antes.email) !== despues.email;
  let usuarioId = emailCambio ? null : (antes?.usuarioId ?? null);
  let invitar: UsuarioLogin | undefined;
  const administra = despues.activo && tienePermisos(despues);
  if (administra) {
    const usuario = await asegurarUsuario(tx, { email: despues.email, nombre: despues.nombre });
    if (usuario.rolSofteam) return { ok: false, error: "ES_SOFTEAM" };
    const ganaAcceso = !(antes?.activo && tienePermisos(antes)) || usuarioId !== usuario.id;
    usuarioId = usuario.id;
    if (ganaAcceso) invitar = usuario;
  }

  const valores = { ...despues, usuarioId, bajaFecha: despues.activo ? null : hoy };
  let id: string;
  if (antes) {
    await tx.update(t.colaboradores).set(valores).where(eq(t.colaboradores.id, antes.id));
    id = antes.id;
  } else {
    const [creado] = await tx
      .insert(t.colaboradores)
      .values({ empresaId, ...valores, altaFecha: hoy })
      .returning({ id: t.colaboradores.id });
    id = creado?.id ?? "";
  }

  await registrarCambioEmpresa(tx, [empresaId]);
  const { usuarioId: _u, ...auditable } = valores;
  await auditar(tx, {
    actorId: actor.usuarioId,
    entidad: "colaborador",
    empresaId: empresaId,
    entidadId: id,
    accion: !antes
      ? "alta"
      : antes.activo !== despues.activo
        ? despues.activo
          ? "reactivacion"
          : "baja"
        : "modificacion",
    antes: antes ? resumen(antes) : undefined,
    despues: { empresaId, ...resumen(auditable) },
  });
  return { ok: true, id, ...(invitar ? { invitar } : {}) };
}

/** Datos del colaborador que interesan en la auditoría. */
function resumen(c: Partial<Cambios>) {
  return {
    nombre: c.nombre,
    email: c.email,
    canalId: c.canalId,
    oficinaId: c.oficinaId,
    permisos: { general: c.adminGeneral, comercial: c.adminComercial, operativo: c.adminOperativo },
    accesos: {
      prodigal: c.accesoProdigal,
      cotiweb: c.accesoCotiweb,
      bienseguro: c.accesoBienseguro,
      boletin: c.accesoBoletin,
    },
    usuarioProdigal: c.usuarioProdigal,
    activo: c.activo,
  };
}

async function bloquearEmpresa(tx: Ejecutor, empresaId: string) {
  await tx
    .select({ id: t.empresas.id })
    .from(t.empresas)
    .where(eq(t.empresas.id, empresaId))
    .for("update");
}

/** Colaborador de la empresa, si está dentro del alcance de quien lo gestiona. */
async function cargar(tx: Ejecutor, empresaId: string, id: string, alcance: Alcance) {
  const fila = await tx.query.colaboradores.findFirst({
    where: and(eq(t.colaboradores.id, id), eq(t.colaboradores.empresaId, empresaId)),
  });
  return fila && abarca(alcance, alcanceDe(fila)) ? fila : undefined;
}

/** Alta o modificación de un colaborador desde el portal. */
export async function guardarColaborador(
  db: Db,
  empresaId: string,
  entrada: EntradaColaborador,
  actor: Actor,
  hoy: Fecha = hoyArgentina(),
): Promise<ResultadoColaborador> {
  return db.transaction(async (tx) => {
    await bloquearEmpresa(tx, empresaId);
    const antes = entrada.id ? await cargar(tx, empresaId, entrada.id, actor.alcance) : undefined;
    if (entrada.id && !antes) return { ok: false, error: "NO_EXISTE" };
    const alcance = await resolverAlcance(tx, empresaId, entrada.alcance);
    // Un delegado solo asigna su canal u oficina (o una oficina de su canal).
    if (!alcance || !abarca(actor.alcance, alcanceDe(alcance))) {
      return { ok: false, error: "ALCANCE_INVALIDO" };
    }
    // El administrador general administra todo: no puede tener un alcance menor.
    if (entrada.adminGeneral && alcance.canalId) {
      return { ok: false, error: "GENERAL_TODA_LA_EMPRESA" };
    }
    return aplicar(
      tx,
      empresaId,
      antes,
      {
        nombre: entrada.nombre,
        iniciales: entrada.iniciales || null,
        email: entrada.email,
        telefono: entrada.telefono || null,
        ...alcance,
        adminGeneral: entrada.adminGeneral,
        adminComercial: entrada.adminComercial,
        adminOperativo: entrada.adminOperativo,
        accesoProdigal: entrada.accesoProdigal,
        accesoCotiweb: entrada.accesoCotiweb,
        accesoBienseguro: entrada.accesoBienseguro,
        accesoBoletin: entrada.accesoBoletin,
        usuarioProdigal: entrada.usuarioProdigal || null,
        activo: antes?.activo ?? true,
      },
      actor,
      hoy,
    );
  });
}

/** Baja o reactivación (la reactivación vuelve a controlar los límites). */
export async function cambiarEstadoColaborador(
  db: Db,
  empresaId: string,
  id: string,
  activo: boolean,
  actor: Actor,
  hoy: Fecha = hoyArgentina(),
): Promise<ResultadoColaborador> {
  return db.transaction(async (tx) => {
    await bloquearEmpresa(tx, empresaId);
    const antes = await cargar(tx, empresaId, id, actor.alcance);
    if (!antes) return { ok: false, error: "NO_EXISTE" };
    return aplicar(tx, empresaId, antes, { ...antes, activo }, actor, hoy);
  });
}

/** Colaborador del usuario en la empresa (para saber si se está editando a sí mismo). */
export async function colaboradorDeUsuario(db: Ejecutor, empresaId: string, usuarioId: string) {
  const fila = await db.query.colaboradores.findFirst({
    columns: { id: true },
    where: and(eq(t.colaboradores.empresaId, empresaId), eq(t.colaboradores.usuarioId, usuarioId)),
  });
  return fila?.id;
}
