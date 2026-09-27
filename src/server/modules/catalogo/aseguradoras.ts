import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { hoy as hoyArgentina } from "@/domain/fecha";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { registrarCambioEmpresa } from "../integraciones/eventos";

/**
 * Catálogo de aseguradoras con su uso: cuántas empresas trabajan con cada una
 * y cuántas tienen cada interfaz vigente hoy.
 */
export async function listarCatalogoAseguradoras(db: Ejecutor, paisId = "AR") {
  const hoy = hoyArgentina();
  const vigente = (marca: "interfaz_prodigal" | "interfaz_cotiweb") =>
    sql<number>`(select count(*)::int from ${t.empresaAseguradoras} ea where ea.aseguradora_id = "aseguradoras"."id" and ea.${sql.raw(marca)} and (ea.${sql.raw(`${marca}_baja_desde`)} is null or ea.${sql.raw(`${marca}_baja_desde`)} > ${hoy}))`;
  return db
    .select({
      id: t.aseguradoras.id,
      nombre: t.aseguradoras.nombre,
      abreviatura: t.aseguradoras.abreviatura,
      codigoLegal: t.aseguradoras.codigoLegal,
      interfazProdigalDisponible: t.aseguradoras.interfazProdigalDisponible,
      interfazCotiwebDisponible: t.aseguradoras.interfazCotiwebDisponible,
      interfazDocumentosDisponible: t.aseguradoras.interfazDocumentosDisponible,
      activa: t.aseguradoras.activa,
      empresas: sql<number>`(select count(*)::int from ${t.empresaAseguradoras} ea where ea.aseguradora_id = "aseguradoras"."id" and ea.activa)`,
      conProdigal: vigente("interfaz_prodigal"),
      conCotiweb: vigente("interfaz_cotiweb"),
    })
    .from(t.aseguradoras)
    .where(eq(t.aseguradoras.paisId, paisId))
    .orderBy(sql`${t.aseguradoras.activa} desc`, asc(t.aseguradoras.nombre));
}

export type AseguradoraCatalogo = Awaited<ReturnType<typeof listarCatalogoAseguradoras>>[number];

export const esquemaAseguradora = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(2, { error: "Ingresá el nombre" }).max(80),
  abreviatura: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, { error: "2 a 10 letras o números, sin espacios" }),
  codigoLegal: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, { error: "Solo números (código SSN)" })
    .optional(),
  interfazProdigalDisponible: z.boolean(),
  interfazCotiwebDisponible: z.boolean(),
  interfazDocumentosDisponible: z.boolean(),
  activa: z.boolean(),
});

export type EntradaAseguradora = z.infer<typeof esquemaAseguradora>;

export type ErrorAseguradoraCatalogo = "NO_EXISTE" | "ABREVIATURA_EXISTENTE";

/**
 * Alta o modificación de una aseguradora del catálogo.
 * - Quitar la disponibilidad de una interfaz no desactiva nada en las
 *   empresas que ya la usan: se les informa y deciden (como cuando baja una
 *   licencia).
 * - Una aseguradora discontinuada no se puede activar en empresas nuevas; las
 *   que ya trabajan con ella la siguen viendo y la pueden dar de baja.
 * - Los productos de las empresas que trabajan con ella reciben el cambio.
 */
export async function guardarAseguradora(
  db: Db,
  entrada: EntradaAseguradora,
  actorId: string,
  paisId = "AR",
): Promise<{ ok: true; id: string } | { ok: false; error: ErrorAseguradoraCatalogo }> {
  return db.transaction(async (tx) => {
    const antes = entrada.id
      ? await tx.query.aseguradoras.findFirst({ where: eq(t.aseguradoras.id, entrada.id) })
      : undefined;
    if (entrada.id && !antes) return { ok: false, error: "NO_EXISTE" };

    const repetida = await tx.query.aseguradoras.findFirst({
      columns: { id: true },
      where: and(
        eq(t.aseguradoras.paisId, antes?.paisId ?? paisId),
        eq(t.aseguradoras.abreviatura, entrada.abreviatura),
        antes ? ne(t.aseguradoras.id, antes.id) : undefined,
      ),
    });
    if (repetida) return { ok: false, error: "ABREVIATURA_EXISTENTE" };

    const valores = {
      nombre: entrada.nombre,
      abreviatura: entrada.abreviatura,
      codigoLegal: entrada.codigoLegal || null,
      interfazProdigalDisponible: entrada.interfazProdigalDisponible,
      interfazCotiwebDisponible: entrada.interfazCotiwebDisponible,
      interfazDocumentosDisponible: entrada.interfazDocumentosDisponible,
      activa: entrada.activa,
    };
    let id: string;
    if (antes) {
      await tx.update(t.aseguradoras).set(valores).where(eq(t.aseguradoras.id, antes.id));
      id = antes.id;
      // La API informa nombre, abreviatura y código de cada aseguradora de la empresa.
      const empresas = await tx
        .select({ id: t.empresaAseguradoras.empresaId })
        .from(t.empresaAseguradoras)
        .where(eq(t.empresaAseguradoras.aseguradoraId, id));
      await registrarCambioEmpresa(
        tx,
        empresas.map((e) => e.id),
      );
    } else {
      const [creada] = await tx
        .insert(t.aseguradoras)
        .values({ paisId, ...valores })
        .returning({ id: t.aseguradoras.id });
      id = creada?.id ?? "";
    }
    await auditar(tx, {
      actorId,
      entidad: "aseguradora",
      entidadId: id,
      accion: antes ? "modificacion" : "alta",
      antes: antes
        ? {
            nombre: antes.nombre,
            abreviatura: antes.abreviatura,
            codigoLegal: antes.codigoLegal,
            interfazProdigalDisponible: antes.interfazProdigalDisponible,
            interfazCotiwebDisponible: antes.interfazCotiwebDisponible,
            interfazDocumentosDisponible: antes.interfazDocumentosDisponible,
            activa: antes.activa,
          }
        : undefined,
      despues: valores,
    });
    return { ok: true, id };
  });
}
