import { desc, eq } from "drizzle-orm";
import { notasVisibles } from "@/domain/cuentas/marca";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { type Referencia, referenciasAuditoria } from "../auditoria-referencias";

/** Notas de SOFTeam sobre la empresa, filtradas según quién mira. */
export async function notasDeEmpresa(db: Ejecutor, empresaId: string, esSofteam: boolean) {
  const empresa = await db.query.empresas.findFirst({
    columns: { notasInternas: true },
    where: eq(t.empresas.id, empresaId),
  });
  return notasVisibles(empresa?.notasInternas, esSofteam);
}

/** Guarda las notas (solo SOFTeam). No cambia la licencia: no avisa a los productos. */
export async function guardarNotas(db: Db, empresaId: string, notas: string, actorId: string) {
  await db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ notas: t.empresas.notasInternas })
      .from(t.empresas)
      .where(eq(t.empresas.id, empresaId))
      .for("update");
    if (!antes) return;
    const nuevas = notas.trim() || null;
    if (nuevas === antes.notas) return;
    await tx.update(t.empresas).set({ notasInternas: nuevas }).where(eq(t.empresas.id, empresaId));
    await auditar(tx, {
      actorId,
      entidad: "notas",
      entidadId: empresaId,
      accion: "modificacion",
      empresaId,
    });
  });
}

/** Nombre legible de un actor automático ("job:renovacion" → "Renovación automática"). */
export function actorAutomatico(tipo: string): string {
  if (tipo === "pasarela") return "Pago en línea";
  if (tipo.startsWith("facturador")) return "Facturación automática";
  if (tipo === "job:renovacion") return "Renovación automática";
  if (tipo.startsWith("job:")) return "Proceso automático";
  if (tipo.startsWith("api:")) return `Sistema ${tipo.slice(4)}`;
  return tipo;
}

export interface Actividad {
  id: number;
  en: Date;
  entidad: string;
  accion: string;
  actor: string;
  antes: unknown;
  despues: unknown;
  /** Sobre qué fue el cambio ("Allianz", "Orden #10033"); con enlace solo para SOFTeam. */
  objeto?: Referencia;
}

/**
 * Histórico de actividad de la empresa (a partir de la auditoría). Para el
 * cliente, las personas de SOFTeam y los procesos aparecen como "SOFTeam" y
 * no se muestran las notas internas.
 */
export async function actividadDeEmpresa(
  db: Ejecutor,
  empresaId: string,
  opciones: { esSofteam: boolean; limite?: number },
): Promise<Actividad[]> {
  const filas = await db
    .select({
      id: t.auditoria.id,
      en: t.auditoria.en,
      entidad: t.auditoria.entidad,
      entidadId: t.auditoria.entidadId,
      empresaId: t.auditoria.empresaId,
      accion: t.auditoria.accion,
      actorTipo: t.auditoria.actorTipo,
      actorNombre: t.usuarios.name,
      actorRol: t.usuarios.rolSofteam,
      antes: t.auditoria.antes,
      despues: t.auditoria.despues,
    })
    .from(t.auditoria)
    .leftJoin(t.usuarios, eq(t.usuarios.id, t.auditoria.actorId))
    .where(eq(t.auditoria.empresaId, empresaId))
    .orderBy(desc(t.auditoria.id))
    .limit(opciones.limite ?? 30);

  const referencias = await referenciasAuditoria(db, filas);
  return filas
    .filter((f) => opciones.esSofteam || f.entidad !== "notas")
    .map((f) => {
      const objeto = referencias.get(f.id)?.objeto;
      const deSofteam = f.actorRol !== null || f.actorTipo !== "usuario";
      const actor =
        !opciones.esSofteam && deSofteam
          ? "SOFTeam"
          : (f.actorNombre ??
            (f.actorTipo === "usuario" ? "Usuario eliminado" : actorAutomatico(f.actorTipo)));
      return {
        id: f.id,
        en: f.en,
        entidad: f.entidad,
        accion: f.accion,
        actor,
        antes: opciones.esSofteam ? f.antes : null,
        despues: opciones.esSofteam ? f.despues : null,
        // Los enlaces van al panel de SOFTeam: el cliente ve solo el nombre.
        ...(objeto ? { objeto: opciones.esSofteam ? objeto : { texto: objeto.texto } } : {}),
      };
    });
}
