import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  type ErrorLimite,
  inicioMesSiguiente,
  interfazVigente,
  puedeActivar,
  type TipoInterfaz,
} from "@/domain/cuentas/limites";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { usoDeLimites } from "./limites";

export interface EstadoInterfaz {
  disponible: boolean;
  marcada: boolean;
  vigente: boolean;
  /** Baja programada que todavía no rige. */
  bajaDesde: Fecha | null;
}

/** Aseguradoras del país de la empresa, con lo que la empresa tiene configurado. */
export async function listarAseguradorasEmpresa(
  db: Ejecutor,
  empresaId: string,
  hoy: Fecha = hoyArgentina(),
) {
  const empresa = await db.query.empresas.findFirst({
    columns: { paisId: true },
    where: eq(t.empresas.id, empresaId),
  });
  if (!empresa) return [];
  const filas = await db
    .select({
      id: t.aseguradoras.id,
      nombre: t.aseguradoras.nombre,
      abreviatura: t.aseguradoras.abreviatura,
      codigoLegal: t.aseguradoras.codigoLegal,
      disponibleProdigal: t.aseguradoras.interfazProdigalDisponible,
      disponibleCotiweb: t.aseguradoras.interfazCotiwebDisponible,
      activa: t.aseguradoras.activa,
      trabaja: t.empresaAseguradoras.activa,
      prodigal: t.empresaAseguradoras.interfazProdigal,
      prodigalBaja: t.empresaAseguradoras.interfazProdigalBajaDesde,
      cotiweb: t.empresaAseguradoras.interfazCotiweb,
      cotiwebBaja: t.empresaAseguradoras.interfazCotiwebBajaDesde,
    })
    .from(t.aseguradoras)
    .leftJoin(
      t.empresaAseguradoras,
      and(
        eq(t.empresaAseguradoras.aseguradoraId, t.aseguradoras.id),
        eq(t.empresaAseguradoras.empresaId, empresaId),
      ),
    )
    // Una discontinuada sigue visible para quien ya la configuró (para darla de baja).
    .where(
      and(
        eq(t.aseguradoras.paisId, empresa.paisId),
        or(eq(t.aseguradoras.activa, true), isNotNull(t.empresaAseguradoras.empresaId)),
      ),
    )
    .orderBy(asc(t.aseguradoras.nombre));

  const estado = (disponible: boolean, marcada: boolean | null, baja: string | null) => {
    const vigente = interfazVigente(marcada ?? false, baja as Fecha | null, hoy);
    return {
      disponible,
      marcada: marcada ?? false,
      vigente,
      bajaDesde: vigente ? (baja as Fecha | null) : null,
    } satisfies EstadoInterfaz;
  };
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    abreviatura: f.abreviatura,
    codigoLegal: f.codigoLegal,
    discontinuada: !f.activa,
    trabaja: f.trabaja ?? false,
    interfaces: {
      prodigal: estado(f.disponibleProdigal, f.prodigal, f.prodigalBaja),
      cotiweb: estado(f.disponibleCotiweb, f.cotiweb, f.cotiwebBaja),
    } satisfies Record<TipoInterfaz, EstadoInterfaz>,
  }));
}

export type AseguradoraEmpresa = Awaited<ReturnType<typeof listarAseguradorasEmpresa>>[number];

export const esquemaCambioAseguradora = z.discriminatedUnion("cambio", [
  z.object({ aseguradoraId: z.uuid(), cambio: z.literal("trabaja"), valor: z.boolean() }),
  z.object({
    aseguradoraId: z.uuid(),
    cambio: z.enum(["prodigal", "cotiweb"]),
    valor: z.boolean(),
  }),
]);

export type CambioAseguradora = z.infer<typeof esquemaCambioAseguradora>;

export type ErrorAseguradora =
  | ErrorLimite
  | "NO_EXISTE"
  | "NO_DISPONIBLE"
  | "NO_TRABAJA"
  | "DISCONTINUADA";

export type ResultadoAseguradora =
  | { ok: true; bajaDesde?: Fecha }
  | { ok: false; error: ErrorAseguradora; detalle?: string };

const COLUMNAS = {
  prodigal: { marca: "interfazProdigal", baja: "interfazProdigalBajaDesde" },
  cotiweb: { marca: "interfazCotiweb", baja: "interfazCotiwebBajaDesde" },
} as const;

/**
 * Trabajar o no con una aseguradora, y activar o dar de baja sus interfaces.
 * - Activar una interfaz controla lo licenciado (4.5).
 * - La baja no es inmediata: rige desde el mes siguiente (el mes ya está
 *   pago). Reactivarla antes de esa fecha cancela la baja.
 * - Dejar de trabajar con una aseguradora programa la baja de sus interfaces.
 */
export async function cambiarAseguradora(
  db: Db,
  empresaId: string,
  cambio: CambioAseguradora,
  actorId: string,
  hoy: Fecha = hoyArgentina(),
): Promise<ResultadoAseguradora> {
  return db.transaction(async (tx) => {
    const [empresa] = await tx
      .select({ paisId: t.empresas.paisId })
      .from(t.empresas)
      .where(eq(t.empresas.id, empresaId))
      .for("update");
    const aseguradora = await tx.query.aseguradoras.findFirst({
      where: eq(t.aseguradoras.id, cambio.aseguradoraId),
    });
    if (!empresa || !aseguradora || aseguradora.paisId !== empresa.paisId) {
      return { ok: false, error: "NO_EXISTE" };
    }
    // Discontinuada: se puede dar de baja, pero no activar nada nuevo.
    if (!aseguradora.activa && cambio.valor) return { ok: false, error: "DISCONTINUADA" };
    const clave = and(
      eq(t.empresaAseguradoras.empresaId, empresaId),
      eq(t.empresaAseguradoras.aseguradoraId, aseguradora.id),
    );
    const actual = await tx.query.empresaAseguradoras.findFirst({ where: clave });
    const antes = actual ? { ...actual } : undefined;
    let bajaDesde: Fecha | undefined;

    if (cambio.cambio === "trabaja") {
      if (!cambio.valor) {
        if (!actual?.activa) return { ok: true };
        const fin = inicioMesSiguiente(hoy);
        const baja = (tipo: TipoInterfaz) =>
          interfazVigente(
            actual[COLUMNAS[tipo].marca],
            actual[COLUMNAS[tipo].baja] as Fecha | null,
            hoy,
          )
            ? (actual[COLUMNAS[tipo].baja] ?? fin)
            : actual[COLUMNAS[tipo].baja];
        await tx
          .update(t.empresaAseguradoras)
          .set({
            activa: false,
            interfazProdigalBajaDesde: baja("prodigal"),
            interfazCotiwebBajaDesde: baja("cotiweb"),
          })
          .where(clave);
      } else if (actual) {
        await tx.update(t.empresaAseguradoras).set({ activa: true }).where(clave);
      } else {
        await tx
          .insert(t.empresaAseguradoras)
          .values({ empresaId, aseguradoraId: aseguradora.id, activa: true });
      }
    } else {
      const tipo = cambio.cambio;
      const { marca, baja } = COLUMNAS[tipo];
      if (!actual?.activa) return { ok: false, error: "NO_TRABAJA" };
      const vigente = interfazVigente(actual[marca], actual[baja] as Fecha | null, hoy);

      if (cambio.valor) {
        if (vigente && actual[baja] === null) return { ok: true };
        if (vigente) {
          // Tenía la baja programada: se cancela, sigue contando como antes.
          await tx
            .update(t.empresaAseguradoras)
            .set({ [baja]: null })
            .where(clave);
        } else {
          const disponible =
            tipo === "prodigal"
              ? aseguradora.interfazProdigalDisponible
              : aseguradora.interfazCotiwebDisponible;
          if (!disponible) return { ok: false, error: "NO_DISPONIBLE" };
          const uso = (await usoDeLimites(tx, empresaId, hoy)).interfaces[tipo];
          const control = puedeActivar(uso, uso.licenciado);
          if (!control.ok) {
            return {
              ok: false,
              error: control.error,
              ...(control.detalle ? { detalle: control.detalle } : {}),
            };
          }
          await tx
            .update(t.empresaAseguradoras)
            .set({ [marca]: true, [baja]: null })
            .where(clave);
        }
      } else {
        if (!vigente || actual[baja] !== null) return { ok: true };
        bajaDesde = inicioMesSiguiente(hoy);
        await tx
          .update(t.empresaAseguradoras)
          .set({ [baja]: bajaDesde })
          .where(clave);
      }
    }

    const despues = await tx.query.empresaAseguradoras.findFirst({ where: clave });
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId,
      entidad: "empresa_aseguradora",
      empresaId: empresaId,
      entidadId: `${empresaId}:${aseguradora.abreviatura}`,
      accion:
        cambio.cambio === "trabaja"
          ? cambio.valor
            ? "alta"
            : "baja"
          : `interfaz_${cambio.cambio}_${cambio.valor ? "alta" : "baja"}`,
      antes,
      despues,
    });
    return { ok: true, ...(bajaDesde ? { bajaDesde } : {}) };
  });
}

export const esquemaAgregarAseguradoras = z.object({
  aseguradoraIds: z
    .array(z.uuid())
    .min(1, { error: "Elegí al menos una aseguradora." })
    .max(200)
    .transform((ids) => [...new Set(ids)]),
  prodigal: z.boolean(),
  cotiweb: z.boolean(),
});

export type EntradaAgregarAseguradoras = z.infer<typeof esquemaAgregarAseguradoras>;

export interface ResultadoAgregarAseguradoras {
  agregadas: number;
  /** Las que no se pudieron agregar o cuya interfaz no se activó, con el motivo. */
  avisos: { nombre: string; que: "trabaja" | TipoInterfaz; error: ErrorAseguradora }[];
}

/**
 * La empresa elige varias aseguradoras del catálogo de una vez y, si quiere,
 * activa sus interfaces. Cada una se agrega con las mismas reglas que de a
 * una (disponibilidad, discontinuadas, límites de la licencia): las que no
 * entran se informan y las demás quedan agregadas.
 */
export async function agregarAseguradoras(
  db: Db,
  empresaId: string,
  entrada: EntradaAgregarAseguradoras,
  actorId: string,
  hoy: Fecha = hoyArgentina(),
): Promise<ResultadoAgregarAseguradoras> {
  const catalogo = await db
    .select({ id: t.aseguradoras.id, nombre: t.aseguradoras.nombre })
    .from(t.aseguradoras)
    .where(inArray(t.aseguradoras.id, entrada.aseguradoraIds))
    .orderBy(asc(t.aseguradoras.nombre));
  const resultado: ResultadoAgregarAseguradoras = { agregadas: 0, avisos: [] };
  for (const a of catalogo) {
    const trabaja = await cambiarAseguradora(
      db,
      empresaId,
      { aseguradoraId: a.id, cambio: "trabaja", valor: true },
      actorId,
      hoy,
    );
    if (!trabaja.ok) {
      resultado.avisos.push({ nombre: a.nombre, que: "trabaja", error: trabaja.error });
      continue;
    }
    resultado.agregadas++;
    for (const tipo of ["prodigal", "cotiweb"] as const) {
      if (!entrada[tipo]) continue;
      const interfaz = await cambiarAseguradora(
        db,
        empresaId,
        { aseguradoraId: a.id, cambio: tipo, valor: true },
        actorId,
        hoy,
      );
      if (!interfaz.ok)
        resultado.avisos.push({ nombre: a.nombre, que: tipo, error: interfaz.error });
    }
  }
  return resultado;
}
