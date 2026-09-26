import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";

/** Una corrida que quedó "en curso" más de este tiempo se considera caída. */
const CORRIDA_CAIDA_MS = 30 * 60 * 1000;

export type ResultadoJob<R> =
  | { estado: "OK"; resumen: R }
  | { estado: "YA_CORRIO" }
  | { estado: "EN_CURSO" }
  | { estado: "ERROR"; error: string };

/**
 * Ejecuta un trabajo una sola vez por clave (tipo + fecha o período). La
 * reserva es atómica: dos procesos que arrancan a la vez no corren el mismo
 * trabajo. Una corrida con error, o una que quedó colgada, se puede
 * reintentar; una exitosa no se repite, salvo que se pida `forzar`.
 *
 * El trabajo en sí también debe ser idempotente: si se cae a mitad de camino,
 * el reintento no puede duplicar lo que ya hizo.
 */
export async function ejecutarJob<R>(
  db: Db,
  job: string,
  clave: string,
  trabajo: () => Promise<R>,
  opciones: { forzar?: boolean } = {},
): Promise<ResultadoJob<R>> {
  const limite = new Date(Date.now() - CORRIDA_CAIDA_MS);
  const [reservada] = await db
    .insert(t.jobRuns)
    .values({ job, clave })
    .onConflictDoUpdate({
      target: [t.jobRuns.job, t.jobRuns.clave],
      set: { estado: "EN_CURSO", iniciadoEn: sql`now()`, finalizadoEn: null, error: null },
      setWhere: or(
        eq(t.jobRuns.estado, "ERROR"),
        // Reprocesar a pedido: seguro porque cada trabajo es idempotente.
        opciones.forzar ? eq(t.jobRuns.estado, "OK") : undefined,
        and(eq(t.jobRuns.estado, "EN_CURSO"), lt(t.jobRuns.iniciadoEn, limite)),
      ),
    })
    .returning({ id: t.jobRuns.id });

  if (!reservada) {
    const actual = await db.query.jobRuns.findFirst({
      columns: { estado: true },
      where: and(eq(t.jobRuns.job, job), eq(t.jobRuns.clave, clave)),
    });
    return actual?.estado === "EN_CURSO" ? { estado: "EN_CURSO" } : { estado: "YA_CORRIO" };
  }

  try {
    const resumen = await trabajo();
    await db
      .update(t.jobRuns)
      .set({ estado: "OK", finalizadoEn: new Date(), resumen: resumen ?? null })
      .where(eq(t.jobRuns.id, reservada.id));
    return { estado: "OK", resumen };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[procesos] ${job} ${clave} falló`, e);
    await db
      .update(t.jobRuns)
      .set({ estado: "ERROR", finalizadoEn: new Date(), error: error.slice(0, 2000) })
      .where(eq(t.jobRuns.id, reservada.id));
    return { estado: "ERROR", error };
  }
}

export async function listarCorridas(db: Ejecutor, limite = 40) {
  return db.select().from(t.jobRuns).orderBy(desc(t.jobRuns.iniciadoEn)).limit(limite);
}
