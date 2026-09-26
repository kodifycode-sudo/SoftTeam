import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/**
 * Tickets con lo que ya se usó: el tope funciona como saldo, así que lo
 * consumido es la suma de los descuentos de las órdenes no canceladas.
 */
export async function listarTickets(db: Ejecutor) {
  const [tickets, paquetes] = await Promise.all([
    db
      .select({
        id: t.tickets.id,
        codigo: t.tickets.codigo,
        descripcion: t.tickets.descripcion,
        porcentaje: t.tickets.porcentaje,
        tope: t.tickets.tope,
        vigenteDesde: t.tickets.vigenteDesde,
        vigenteHasta: t.tickets.vigenteHasta,
        activo: t.tickets.activo,
        consumido: sql<string>`coalesce((select sum(o.ticket_descuento) from ${t.ordenes} o where o.ticket_id = "tickets"."id" and o.estado <> 'CANCELADA'), 0)::text`,
        usos: sql<number>`(select count(*)::int from ${t.ordenes} o where o.ticket_id = "tickets"."id" and o.estado <> 'CANCELADA' and o.tipo_generacion = 'MANUAL')`,
      })
      .from(t.tickets)
      .orderBy(desc(t.tickets.activo), desc(t.tickets.vigenteHasta), asc(t.tickets.codigo)),
    db
      .select({
        ticketId: t.ticketPaquetes.ticketId,
        nombre: t.paquetes.nombre,
      })
      .from(t.ticketPaquetes)
      .innerJoin(t.paquetes, eq(t.paquetes.id, t.ticketPaquetes.paqueteId)),
  ]);
  return tickets.map((k) => ({
    ...k,
    // Centavos exactos (la suma llega como texto decimal de Postgres).
    consumido: centavos(k.consumido),
    paquetes: paquetes.filter((p) => p.ticketId === k.id).map((p) => p.nombre),
  }));
}

export type TicketListado = Awaited<ReturnType<typeof listarTickets>>[number];

const texto = (v: string, ctx: z.RefinementCtx, mensaje: string) => {
  try {
    return fecha(v);
  } catch {
    ctx.addIssue({ code: "custom", message: mensaje });
    return z.NEVER;
  }
};

export const esquemaTicket = z
  .object({
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{4,20}$/, { error: "4 a 20 caracteres: letras, números o guiones" }),
    descripcion: z.string().trim().max(200).optional(),
    porcentaje: z
      .string()
      .trim()
      .regex(/^\d{1,3}([.,]\d{1,2})?$/, { error: "Porcentaje inválido" })
      .transform((v) => porcentaje(v))
      .refine((p) => p > 0n && p <= 10_000n, { error: "Entre 0 y 100 %" }),
    tope: z
      .string()
      .trim()
      .regex(/^\d{1,12}([.,]\d{1,2})?$/, { error: "Importe inválido" })
      .transform((v) => centavos(v))
      .refine((c) => c > 0n, { error: "El tope debe ser mayor a cero" }),
    vigenteDesde: z.string().transform((v, ctx) => texto(v, ctx, "Fecha inválida")),
    vigenteHasta: z.string().transform((v, ctx) => texto(v, ctx, "Fecha inválida")),
    paquetes: z.array(z.uuid()).max(100),
  })
  .refine((k) => k.vigenteHasta >= k.vigenteDesde, {
    path: ["vigenteHasta"],
    error: "Debe ser posterior al inicio",
  });

export type EntradaTicket = z.infer<typeof esquemaTicket>;

export async function crearTicket(
  db: Db,
  entrada: EntradaTicket,
  actorId: string,
): Promise<
  { ok: true; id: string } | { ok: false; error: "CODIGO_EXISTENTE" | "PAQUETE_INVALIDO" }
> {
  return db.transaction(async (tx) => {
    const existente = await tx.query.tickets.findFirst({
      columns: { id: true },
      where: eq(t.tickets.codigo, entrada.codigo),
    });
    if (existente) return { ok: false, error: "CODIGO_EXISTENTE" };
    if (entrada.paquetes.length > 0) {
      const validos = await tx
        .select({ id: t.paquetes.id })
        .from(t.paquetes)
        .where(inArray(t.paquetes.id, entrada.paquetes));
      if (validos.length !== new Set(entrada.paquetes).size) {
        return { ok: false, error: "PAQUETE_INVALIDO" };
      }
    }
    const [ticket] = await tx
      .insert(t.tickets)
      .values({
        codigo: entrada.codigo,
        descripcion: entrada.descripcion || null,
        porcentaje: entrada.porcentaje,
        tope: entrada.tope,
        vigenteDesde: entrada.vigenteDesde,
        vigenteHasta: entrada.vigenteHasta,
      })
      .returning({ id: t.tickets.id });
    if (!ticket) throw new Error("No se pudo crear el ticket");
    if (entrada.paquetes.length > 0) {
      await tx
        .insert(t.ticketPaquetes)
        .values(
          [...new Set(entrada.paquetes)].map((paqueteId) => ({ ticketId: ticket.id, paqueteId })),
        );
    }
    await auditar(tx, {
      actorId,
      entidad: "ticket",
      entidadId: ticket.id,
      accion: "alta",
      despues: {
        codigo: entrada.codigo,
        porcentaje: entrada.porcentaje.toString(),
        tope: entrada.tope.toString(),
        vigencia: [entrada.vigenteDesde, entrada.vigenteHasta],
        paquetes: entrada.paquetes,
      },
    });
    return { ok: true, id: ticket.id };
  });
}

export async function cambiarEstadoTicket(db: Db, id: string, activo: boolean, actorId: string) {
  await db.transaction(async (tx) => {
    const [cambiado] = await tx
      .update(t.tickets)
      .set({ activo })
      .where(and(eq(t.tickets.id, id), ne(t.tickets.activo, activo)))
      .returning({ codigo: t.tickets.codigo });
    if (!cambiado) return;
    await auditar(tx, {
      actorId,
      entidad: "ticket",
      entidadId: id,
      accion: activo ? "activar" : "inactivar",
      despues: { codigo: cambiado.codigo },
    });
  });
}
