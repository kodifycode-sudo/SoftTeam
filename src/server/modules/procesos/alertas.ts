import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { type Alcance, TODA_LA_EMPRESA } from "@/domain/cuentas/alcance";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { alertaEnAlcance } from "../cuentas/alcance";

export type TipoAlerta = (typeof t.alertas.$inferSelect)["tipo"];
export type EstadoAlerta = (typeof t.alertas.$inferSelect)["estado"];

export interface NuevaAlerta {
  tipo: TipoAlerta;
  /** Hace idempotente la generación: la misma clave no crea dos alertas. */
  clave: string;
  mensaje: string;
  empresaId?: string | null;
  contratoId?: string | null;
  ordenId?: string | null;
  /** Alcance explícito (delegados): p. ej. la respuesta a un pedido de una oficina. */
  canalId?: string | null;
  oficinaId?: string | null;
  paraCliente?: boolean;
  paraSofteam?: boolean;
}

const LARGO_CLAVE = 160;

/**
 * Clave de deduplicación que entra en la columna: las largas (por ejemplo,
 * con el id de un pago) se compactan con un hash, que las mantiene únicas y
 * deterministas.
 */
export function claveDeAlerta(clave: string): string {
  if (clave.length <= LARGO_CLAVE) return clave;
  const hash = createHash("sha256").update(clave).digest("base64url");
  return `${clave.slice(0, LARGO_CLAVE - hash.length - 1)}#${hash}`;
}

/** Registra una alerta si todavía no existe. Devuelve si la creó. */
export async function registrarAlerta(db: Ejecutor, a: NuevaAlerta): Promise<boolean> {
  const creada = await db
    .insert(t.alertas)
    .values({
      tipo: a.tipo,
      claveDeduplicacion: claveDeAlerta(a.clave),
      mensaje: a.mensaje.slice(0, 300),
      empresaId: a.empresaId ?? null,
      contratoId: a.contratoId ?? null,
      ordenId: a.ordenId ?? null,
      canalId: a.canalId ?? null,
      oficinaId: a.oficinaId ?? null,
      paraCliente: a.paraCliente ?? true,
      paraSofteam: a.paraSofteam ?? true,
    })
    .onConflictDoNothing({ target: t.alertas.claveDeduplicacion })
    .returning({ id: t.alertas.id });
  return creada.length > 0;
}

// ─── Portal ──────────────────────────────────────────────────────────────────

/** Avisos de la empresa (un delegado ve solo los de su alcance). */
export async function avisosDeEmpresa(
  db: Ejecutor,
  empresaId: string,
  limite = 50,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  return db
    .select({
      id: t.alertas.id,
      tipo: t.alertas.tipo,
      mensaje: t.alertas.mensaje,
      generadaEn: t.alertas.generadaEn,
      leidaEn: t.alertas.leidaEn,
      ordenId: t.alertas.ordenId,
    })
    .from(t.alertas)
    .where(
      and(
        eq(t.alertas.empresaId, empresaId),
        eq(t.alertas.paraCliente, true),
        sql`${t.alertas.estado} <> 'DESCARTADA'`,
        alertaEnAlcance(alcance),
      ),
    )
    .orderBy(desc(t.alertas.generadaEn))
    .limit(limite);
}

export async function avisosSinLeer(
  db: Ejecutor,
  empresaId: string,
  alcance: Alcance = TODA_LA_EMPRESA,
): Promise<number> {
  const [fila] = await db
    .select({ total: count() })
    .from(t.alertas)
    .where(
      and(
        eq(t.alertas.empresaId, empresaId),
        eq(t.alertas.paraCliente, true),
        isNull(t.alertas.leidaEn),
        sql`${t.alertas.estado} <> 'DESCARTADA'`,
        alertaEnAlcance(alcance),
      ),
    );
  return fila?.total ?? 0;
}

/** Marca como leídos los avisos de la empresa (todos o uno), solo los del alcance. */
export async function marcarAvisosLeidos(
  db: Ejecutor,
  empresaId: string,
  id?: string,
  alcance: Alcance = TODA_LA_EMPRESA,
) {
  await db
    .update(t.alertas)
    .set({ leidaEn: new Date() })
    .where(
      and(
        eq(t.alertas.empresaId, empresaId),
        isNull(t.alertas.leidaEn),
        id ? eq(t.alertas.id, id) : undefined,
        alertaEnAlcance(alcance),
      ),
    );
}

// ─── SOFTeam ─────────────────────────────────────────────────────────────────

export async function listarAlertas(
  db: Ejecutor,
  filtros: { tipo?: TipoAlerta | undefined; estado?: EstadoAlerta | undefined },
  limite = 100,
) {
  return db
    .select({
      id: t.alertas.id,
      tipo: t.alertas.tipo,
      estado: t.alertas.estado,
      mensaje: t.alertas.mensaje,
      generadaEn: t.alertas.generadaEn,
      enviadaEn: t.alertas.enviadaEn,
      leidaEn: t.alertas.leidaEn,
      error: t.alertas.error,
      empresaNumero: t.empresas.numero,
      empresaNombre: t.empresas.nombre,
      clienteId: t.empresas.clienteId,
    })
    .from(t.alertas)
    .leftJoin(t.empresas, eq(t.empresas.id, t.alertas.empresaId))
    .where(
      and(
        eq(t.alertas.paraSofteam, true),
        filtros.tipo ? eq(t.alertas.tipo, filtros.tipo) : undefined,
        filtros.estado ? eq(t.alertas.estado, filtros.estado) : undefined,
      ),
    )
    .orderBy(desc(t.alertas.generadaEn))
    .limit(limite);
}

export async function descartarAlerta(db: Ejecutor, id: string) {
  await db.update(t.alertas).set({ estado: "DESCARTADA" }).where(eq(t.alertas.id, id));
}

// ─── Envío por mail ──────────────────────────────────────────────────────────

export interface MailAlerta {
  para: string[];
  asunto: string;
  mensaje: string;
  empresa: string;
}

export type EnviarAlerta = (mail: MailAlerta) => Promise<void>;

const ASUNTOS: Partial<Record<TipoAlerta, string>> = {
  // Los días son configurables (alertas.vencimiento_dias): el cuerpo dice cuántos faltan.
  VENCIMIENTO_15D: "Un paquete está por vencer",
  VENCIMIENTO_7D: "Un paquete vence pronto",
  VENCIMIENTO_1D: "Último aviso: un paquete está por vencer",
  SALDO_BAJO: "Te queda poco saldo",
  SALDO_AGOTADO: "Se agotó tu saldo",
  PLAZO_PAGO_POR_VENCER: "Vence el plazo para pagar",
  LICENCIA_VENCIDA: "Venció un paquete",
  EMPRESA_SIN_PAQUETE: "Tu empresa no tiene paquetes vigentes",
  LIMITE_EXCEDIDO: "Tenés más usuarios o interfaces que los licenciados",
  LICENCIA_POR_BAJAR: "Al vencer un paquete vas a quedar con más de lo licenciado",
  RENOVACION_GENERADA: "Generamos tu orden de renovación",
  RECORDATORIO_PAGO: "Tenés una orden pendiente de pago",
  SOPORTE_RESPUESTA: "Soporte respondió tu consulta",
  FACTURACION_RESUELTA: "Respondimos tu pedido de facturación",
};

/** Mails de quienes administran la cuenta: general y comercial, con acceso activo. */
async function destinatarios(db: Ejecutor, empresaIds: string[]) {
  if (empresaIds.length === 0) return new Map<string, string[]>();
  const filas = await db
    .select({ empresaId: t.colaboradores.empresaId, email: t.usuarios.email })
    .from(t.colaboradores)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.colaboradores.usuarioId))
    .where(
      and(
        inArray(t.colaboradores.empresaId, empresaIds),
        eq(t.colaboradores.activo, true),
        eq(t.usuarios.emailVerified, true),
        or(eq(t.colaboradores.adminGeneral, true), eq(t.colaboradores.adminComercial, true)),
      ),
    );
  const mapa = new Map<string, string[]>();
  for (const f of filas) {
    const lista = mapa.get(f.empresaId) ?? [];
    if (!lista.includes(f.email)) lista.push(f.email);
    mapa.set(f.empresaId, lista);
  }
  return mapa;
}

/**
 * Envía por mail las alertas pendientes para clientes. Cada alerta queda
 * ENVIADA o con ERROR (se reintenta en la próxima corrida, hasta que tenga
 * un día de antigüedad). Las que no tienen a quién enviarse quedan ENVIADAS
 * igual: se ven en el portal.
 */
export async function enviarAlertasPendientes(
  db: Db,
  enviar: EnviarAlerta,
  limite = 200,
): Promise<{ enviadas: number; errores: number }> {
  const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pendientes = await db
    .select({
      id: t.alertas.id,
      tipo: t.alertas.tipo,
      mensaje: t.alertas.mensaje,
      empresaId: t.alertas.empresaId,
      empresa: t.empresas.nombre,
    })
    .from(t.alertas)
    .innerJoin(t.empresas, eq(t.empresas.id, t.alertas.empresaId))
    .where(
      and(
        eq(t.alertas.paraCliente, true),
        or(
          eq(t.alertas.estado, "PENDIENTE"),
          and(eq(t.alertas.estado, "ERROR"), gt(t.alertas.generadaEn, ayer)),
        ),
      ),
    )
    .orderBy(asc(t.alertas.generadaEn))
    .limit(limite);

  const para = await destinatarios(db, [
    ...new Set(pendientes.flatMap((p) => (p.empresaId ? [p.empresaId] : []))),
  ]);
  let enviadas = 0;
  let errores = 0;
  for (const alerta of pendientes) {
    const mails = alerta.empresaId ? (para.get(alerta.empresaId) ?? []) : [];
    try {
      if (mails.length > 0) {
        await enviar({
          para: mails,
          asunto: ASUNTOS[alerta.tipo] ?? "Aviso de STLic",
          mensaje: alerta.mensaje,
          empresa: alerta.empresa,
        });
      }
      await db
        .update(t.alertas)
        .set({ estado: "ENVIADA", enviadaEn: new Date(), error: null })
        .where(eq(t.alertas.id, alerta.id));
      enviadas++;
    } catch (e) {
      errores++;
      await db
        .update(t.alertas)
        .set({ estado: "ERROR", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
        .where(eq(t.alertas.id, alerta.id));
    }
  }
  return { enviadas, errores };
}
