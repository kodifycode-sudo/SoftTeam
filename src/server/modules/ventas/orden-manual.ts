import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { porcentaje } from "@/domain/dinero";
import { type Fecha, fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { TRIMESTRAL_INICIAL } from "@/domain/licencias/periodo";
import { exito, type Resultado, rechazo } from "@/domain/resultado";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { vendibleHoy } from "../catalogo/paquetes";
import {
  type Cotizacion,
  confirmarAltaAGrupo,
  confirmarOrden,
  cotizarCarrito,
  type ItemCotizable,
  type RechazoCompra,
} from "./checkout";

/*
 * Orden manual de Administración SOFTeam ( y
 * 11.8): paquetes privados, bonificación por paquete (el consumible al 100 %
 * con su saldo editable), renovación negociada del trimestre inicial,
 * cualquier medio habilitado, tickets no públicos, "fecha desde" en las altas
 * a grupo y emisor de la orden. Usa la misma cotización que el carrito.
 */

/** Paquetes a la venta hoy en el país de la empresa, incluidos los privados. */
export async function catalogoOrdenManual(
  db: Ejecutor,
  empresaId: string,
  hoy: Fecha = hoyArgentina(),
) {
  const empresa = await db.query.empresas.findFirst({
    columns: { paisId: true },
    where: eq(t.empresas.id, empresaId),
  });
  if (!empresa) return [];
  return db
    .select({
      alternativaId: t.alternativas.id,
      alternativa: t.alternativas.nombre,
      meses: t.alternativas.meses,
      precioCompra: t.alternativas.precioCompra,
      paquete: t.paquetes.nombre,
      tipoPaquete: t.paquetes.tipo,
      privado: t.paquetes.privado,
      /** Unidades de saldo que trae una unidad del paquete (consumibles). */
      saldo: sql<number>`coalesce((select sum(pr.cantidad) from ${t.paqueteRecursos} pr join ${t.recursos} r on r.id = pr.recurso_id where pr.paquete_id = ${t.paquetes.id} and r.clase = 'SALDO'), 0)::int`,
    })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(
      and(eq(t.alternativas.activa, true), eq(t.paquetes.paisId, empresa.paisId), vendibleHoy(hoy)),
    )
    .orderBy(asc(t.paquetes.nombre), asc(t.alternativas.meses));
}

export type OpcionCatalogoManual = Awaited<ReturnType<typeof catalogoOrdenManual>>[number];

/**
 * Paquetes temporales que Administración puede renovar a mano, incluido el
 * trimestre inicial, con las alternativas de renovación (no trimestral).
 */
export async function renovablesOrdenManual(db: Ejecutor, empresaId: string) {
  const contratos = await db
    .select({
      id: t.contratos.id,
      paqueteId: t.contratos.paqueteId,
      paquete: t.paquetes.nombre,
      cantidad: t.contratos.cantidad,
      hasta: t.contratos.hasta,
      diaVenc: t.contratos.diaVenc,
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .where(
      and(
        eq(t.contratos.empresaId, empresaId),
        eq(t.contratos.tipoPaquete, "TEMPORAL"),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        isNotNull(t.contratos.hasta),
        sql`not exists (select 1 from ${t.contratos} r where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO')`,
      ),
    )
    .orderBy(asc(t.contratos.hasta));
  if (contratos.length === 0) return [];
  const alternativas = await db
    .select({
      id: t.alternativas.id,
      paqueteId: t.alternativas.paqueteId,
      nombre: t.alternativas.nombre,
      meses: t.alternativas.meses,
    })
    .from(t.alternativas)
    .where(
      and(
        inArray(t.alternativas.paqueteId, [...new Set(contratos.map((c) => c.paqueteId))]),
        eq(t.alternativas.activa, true),
        isNotNull(t.alternativas.meses),
        ne(t.alternativas.meses, TRIMESTRAL_INICIAL),
      ),
    )
    .orderBy(asc(t.alternativas.meses));
  return contratos.map((c) => ({
    ...c,
    trimestreInicial: c.diaVenc === null,
    alternativas: alternativas.filter((a) => a.paqueteId === c.paqueteId),
  }));
}

export type RenovableManual = Awaited<ReturnType<typeof renovablesOrdenManual>>[number];

const fechaOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((v) => fecha(v))
  .optional();

export const esquemaItemManual = z
  .object({
    alternativaId: z.uuid(),
    cantidad: z.coerce.number().int().min(1).max(99),
    /** Renovación: el contrato que se renueva. */
    contratoAnteriorId: z.uuid().optional(),
    bonificacion: z
      .string()
      .trim()
      .regex(/^\d{1,3}([.,]\d{1,2})?$/, { error: "Porcentaje inválido" })
      .transform((v) => porcentaje(v))
      .refine((p) => p >= 0n && p <= 10_000n, { error: "Entre 0 y 100 %" }),
    recurrente: z.boolean(),
    motivo: z.string().trim().max(200).optional(),
    /** Consumible bonificado al 100 %: unidades del saldo. */
    cantidadSaldo: z.coerce.number().int().min(1).max(10_000_000).optional(),
  })
  .refine((i) => i.bonificacion === 0n || i.motivo, {
    path: ["motivo"],
    error: "Contá el motivo de la bonificación (queda en la auditoría).",
  });

export const esquemaOrdenManual = z.object({
  empresaId: z.uuid(),
  items: z.array(esquemaItemManual).min(1, { error: "Agregá al menos un paquete." }).max(30),
  medioPagoId: z.uuid().optional(),
  ticketCodigo: z.string().trim().max(20).optional(),
  diaVenc: z.coerce.number().int().min(1).max(28).optional(),
  fechaDesde: fechaOpcional,
  emisorId: z.uuid().optional(),
});

export type EntradaOrdenManual = z.infer<typeof esquemaOrdenManual>;

export type RechazoOrdenManual =
  | RechazoCompra
  | "ITEM_INVALIDO"
  | "SALDO_SOLO_BONIFICADO"
  | "RENOVACION_INVALIDA";

/** Convierte lo que eligió Administración en ítems cotizables. */
async function itemsDeLaOrden(
  db: Ejecutor,
  entrada: EntradaOrdenManual,
): Promise<Resultado<ItemCotizable[], RechazoOrdenManual>> {
  const alternativas = await db
    .select({
      alternativaId: t.alternativas.id,
      alternativa: t.alternativas.nombre,
      meses: t.alternativas.meses,
      precioCompra: t.alternativas.precioCompra,
      precioRenovacion: t.alternativas.precioRenovacion,
      alternativaActiva: t.alternativas.activa,
      paqueteId: t.paquetes.id,
      paquete: t.paquetes.nombre,
      codigo: t.paquetes.codigo,
      tipoPaquete: t.paquetes.tipo,
      paqueteActivo: t.paquetes.activo,
    })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(
      inArray(
        t.alternativas.id,
        entrada.items.map((i) => i.alternativaId),
      ),
    );
  const anteriores = entrada.items.some((i) => i.contratoAnteriorId)
    ? await db
        .select()
        .from(t.contratos)
        .where(
          and(
            eq(t.contratos.empresaId, entrada.empresaId),
            inArray(
              t.contratos.id,
              entrada.items.flatMap((i) => (i.contratoAnteriorId ? [i.contratoAnteriorId] : [])),
            ),
          ),
        )
    : [];
  const items: ItemCotizable[] = [];
  for (const [n, i] of entrada.items.entries()) {
    const alt = alternativas.find((a) => a.alternativaId === i.alternativaId);
    if (!alt) return rechazo("ITEM_INVALIDO");
    const anterior = i.contratoAnteriorId
      ? anteriores.find((a) => a.id === i.contratoAnteriorId)
      : undefined;
    if (i.contratoAnteriorId && (!anterior || anterior.paqueteId !== alt.paqueteId)) {
      return rechazo("RENOVACION_INVALIDA", alt.paquete);
    }
    const cien = i.bonificacion >= 10_000n;
    if (i.cantidadSaldo !== undefined && !(cien && alt.tipoPaquete === "CONSUMIBLE")) {
      return rechazo("SALDO_SOLO_BONIFICADO", alt.paquete);
    }
    items.push({
      ...alt,
      id: `manual-${n}`,
      cantidad: anterior ? anterior.cantidad : i.cantidad,
      tipoAccion: anterior ? "RENOVACION" : "ALTA",
      contratoAnteriorId: anterior?.id ?? null,
      anteriorHasta: anterior?.hasta ?? null,
      anteriorDiaVenc: anterior?.diaVenc ?? null,
      bonifRenovacion: 0n,
      manual: {
        bonifPorcentaje: i.bonificacion,
        bonifRecurrente: cien ? false : i.recurrente,
        bonifMotivo: i.motivo || null,
        cantidadSaldo: i.cantidadSaldo ?? null,
      },
    });
  }
  return exito(items);
}

const opcionesManuales = (entrada: EntradaOrdenManual, items: ItemCotizable[]) => ({
  medioPagoId: entrada.medioPagoId,
  ticketCodigo: entrada.ticketCodigo || undefined,
  diaVenc: entrada.diaVenc,
  softeam: true,
  items,
  emisorId: entrada.emisorId,
  fechaDesde: entrada.fechaDesde,
});

/** Cotiza la orden manual sin grabar nada (la pantalla muestra el desglose). */
export async function cotizarOrdenManual(
  db: Ejecutor,
  entrada: EntradaOrdenManual,
  hoy: Fecha = hoyArgentina(),
): Promise<Resultado<Cotizacion, RechazoOrdenManual>> {
  const items = await itemsDeLaOrden(db, entrada);
  if (!items.ok) return items;
  return cotizarCarrito(db, entrada.empresaId, opcionesManuales(entrada, items.valor), hoy);
}

/**
 * Confirma la orden manual. Si es un alta a grupo, graba los paquetes sin
 * orden (los incorpora la colectiva). Sin importe (bonificada al 100 %), la
 * orden queda pagada y los paquetes activos, sin link ni factura.
 */
export async function confirmarOrdenManual(
  db: Db,
  entrada: EntradaOrdenManual & { usuarioId: string; claveIdempotencia: string },
  hoy: Fecha = hoyArgentina(),
): Promise<
  Resultado<
    { ordenId: string | null; numero: number | null; contratos: number },
    RechazoOrdenManual
  >
> {
  const items = await itemsDeLaOrden(db, entrada);
  if (!items.ok) return items;
  const base = {
    empresaId: entrada.empresaId,
    usuarioId: entrada.usuarioId,
    ...opcionesManuales(entrada, items.valor),
  };
  const orden = await confirmarOrden(
    db,
    { ...base, claveIdempotencia: entrada.claveIdempotencia },
    hoy,
  );
  if (orden.ok) {
    return exito({
      ordenId: orden.valor.ordenId,
      numero: orden.valor.numero,
      contratos: items.valor.length,
    });
  }
  if (orden.error !== "ALTA_A_GRUPO") return orden;
  const alta = await confirmarAltaAGrupo(db, base, hoy);
  if (!alta.ok) return alta;
  return exito({ ordenId: null, numero: null, contratos: alta.valor.contratos });
}
