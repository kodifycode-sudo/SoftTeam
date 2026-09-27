import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { normalizarCuit } from "@/domain/cuentas/cuit";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";

/** Oficinas de las empresas con el cliente al que se facturan sus compras delegadas. */
export async function facturacionDeOficinas(db: Ejecutor, empresaIds: readonly string[]) {
  if (empresaIds.length === 0) return [];
  return db
    .select({
      id: t.oficinas.id,
      empresaId: t.oficinas.empresaId,
      codigo: t.oficinas.codigo,
      canalCodigo: t.canales.codigo,
      nombre: t.oficinas.nombre,
      activa: t.oficinas.activa,
      cliente: {
        id: t.clientes.id,
        numero: t.clientes.numero,
        nombreFactura: t.clientes.nombreFactura,
        cuit: t.clientes.cuit,
        activo: t.clientes.activo,
      },
    })
    .from(t.oficinas)
    .innerJoin(t.canales, eq(t.canales.id, t.oficinas.canalId))
    .leftJoin(t.clientes, eq(t.clientes.id, t.oficinas.clienteFacturacionId))
    .where(inArray(t.oficinas.empresaId, [...empresaIds]))
    .orderBy(asc(t.canales.codigo), asc(t.oficinas.codigo));
}

export type FacturacionOficina = Awaited<ReturnType<typeof facturacionDeOficinas>>[number];

export const esquemaFacturacionOficina = z.object({
  oficinaId: z.uuid(),
  /** CUIT (con o sin guiones) o número de cliente. Vacío: se factura al cliente de la empresa. */
  cliente: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^\d{4,11}$/.test(v.replace(/[-\s.]/g, "")), {
      error: "Ingresá el CUIT o el número de cliente",
    }),
});

export type ErrorFacturacionOficina =
  | "OFICINA_INEXISTENTE"
  | "CLIENTE_INEXISTENTE"
  | "CLIENTE_INACTIVO"
  | "MISMO_CLIENTE";

/**
 * Asigna (o quita) el cliente al que se facturan las compras delegadas de una
 * oficina. Lo hace SOFTeam: facturar a otra razón social compromete a un
 * tercero, que tiene que ser un cliente registrado y activo. Las órdenes ya
 * emitidas conservan su cliente de facturación.
 */
export async function asignarFacturacionOficina(
  db: Db,
  entrada: z.infer<typeof esquemaFacturacionOficina>,
  actorId: string,
): Promise<
  | { ok: true; cliente: { nombreFactura: string } | null }
  | { ok: false; error: ErrorFacturacionOficina }
> {
  return db.transaction(async (tx) => {
    const [oficina] = await tx
      .select({
        id: t.oficinas.id,
        empresaId: t.oficinas.empresaId,
        clienteFacturacionId: t.oficinas.clienteFacturacionId,
        clienteEmpresaId: t.empresas.clienteId,
      })
      .from(t.oficinas)
      .innerJoin(t.empresas, eq(t.empresas.id, t.oficinas.empresaId))
      .where(eq(t.oficinas.id, entrada.oficinaId))
      .for("update", { of: t.oficinas });
    if (!oficina) return { ok: false, error: "OFICINA_INEXISTENTE" };

    let cliente: { id: string; nombreFactura: string } | null = null;
    const buscado = entrada.cliente.replace(/[-\s.]/g, "");
    if (buscado) {
      const fila = await tx.query.clientes.findFirst({
        columns: { id: true, nombreFactura: true, activo: true },
        where:
          buscado.length === 11
            ? eq(t.clientes.cuit, normalizarCuit(buscado))
            : eq(t.clientes.numero, Number(buscado)),
      });
      if (!fila) return { ok: false, error: "CLIENTE_INEXISTENTE" };
      if (!fila.activo) return { ok: false, error: "CLIENTE_INACTIVO" };
      if (fila.id === oficina.clienteEmpresaId) return { ok: false, error: "MISMO_CLIENTE" };
      cliente = { id: fila.id, nombreFactura: fila.nombreFactura };
    }

    await tx
      .update(t.oficinas)
      .set({ clienteFacturacionId: cliente?.id ?? null })
      .where(eq(t.oficinas.id, oficina.id));
    await auditar(tx, {
      actorId,
      entidad: "oficina",
      entidadId: oficina.id,
      empresaId: oficina.empresaId,
      accion: "facturacion",
      antes: { clienteFacturacionId: oficina.clienteFacturacionId },
      despues: { clienteFacturacionId: cliente?.id ?? null },
    });
    return { ok: true, cliente: cliente ? { nombreFactura: cliente.nombreFactura } : null };
  });
}
