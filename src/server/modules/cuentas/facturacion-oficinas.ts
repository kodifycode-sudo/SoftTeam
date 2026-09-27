import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { type Alcance, abarcaOficina } from "@/domain/cuentas/alcance";
import { esCuitValido, formatearCuit, normalizarCuit } from "@/domain/cuentas/cuit";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { leerParametro } from "../parametros";
import { registrarAlerta } from "../procesos/alertas";

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
): Promise<ResultadoFacturacion> {
  return db.transaction((tx) => aplicarFacturacion(tx, entrada, actorId));
}

type ResultadoFacturacion =
  | { ok: true; cliente: { nombreFactura: string } | null }
  | { ok: false; error: ErrorFacturacionOficina };

async function aplicarFacturacion(
  tx: Ejecutor,
  entrada: z.infer<typeof esquemaFacturacionOficina>,
  actorId: string,
): Promise<ResultadoFacturacion> {
  {
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
  }
}

// ─── Pedidos de la empresa ───────────────────────────────────────────────────

/**
 * Los pedidos desde el portal están apagados hasta confirmar con Comercial
 * que existen oficinas pagadas por otra razón social (ver ESPECIFICACION,
 * 4.3). Mientras tanto, solo SOFTeam asigna el cliente de facturación.
 */
export const pedidoFacturacionHabilitado = (db: Ejecutor) =>
  leerParametro(db, "oficinas.pedido_facturacion", z.boolean(), false);

export const esquemaPedidoFacturacion = z.object({
  oficinaId: z.uuid(),
  /** CUIT a facturar; vacío: volver a facturar a la empresa. */
  cuit: z
    .string()
    .trim()
    .refine((v) => v === "" || esCuitValido(v), { error: "El CUIT no es válido" })
    .transform((v) => (v === "" ? null : normalizarCuit(v))),
  comentario: z.string().trim().max(300).optional(),
});

export type ErrorPedidoFacturacion =
  | "OFICINA_INEXISTENTE"
  | "YA_PENDIENTE"
  | "SIN_CAMBIO"
  | "MISMO_CLIENTE"
  | "NO_EXISTE"
  | "NO_PENDIENTE"
  | "FALTA_MOTIVO"
  | ErrorFacturacionOficina;

const etiquetaOficina = (o: { canal: string; codigo: string; nombre: string }) =>
  `${o.canal}-${o.codigo} · ${o.nombre}`;

/**
 * La empresa pide facturar las compras de una oficina a otro CUIT (o volver
 * a la empresa). Solo quien administra paquetes y pagos de esa oficina; una
 * sola solicitud pendiente por oficina. SOFTeam recibe una alerta.
 */
export async function pedirFacturacionOficina(
  db: Db,
  empresaId: string,
  entrada: z.output<typeof esquemaPedidoFacturacion>,
  actor: { usuarioId: string; alcance: Alcance },
): Promise<{ ok: true; id: string } | { ok: false; error: ErrorPedidoFacturacion }> {
  return db.transaction(async (tx) => {
    const [oficina] = await tx
      .select({
        id: t.oficinas.id,
        canalId: t.oficinas.canalId,
        canal: t.canales.codigo,
        codigo: t.oficinas.codigo,
        nombre: t.oficinas.nombre,
        clienteFacturacionId: t.oficinas.clienteFacturacionId,
        cuitActual: t.clientes.cuit,
        cuitEmpresa: sql<string>`(select c.cuit from ${t.clientes} c join ${t.empresas} e on e.cliente_id = c.id where e.id = ${t.oficinas.empresaId})`,
        empresa: sql<string>`(select e.nombre from ${t.empresas} e where e.id = ${t.oficinas.empresaId})`,
      })
      .from(t.oficinas)
      .innerJoin(t.canales, eq(t.canales.id, t.oficinas.canalId))
      .leftJoin(t.clientes, eq(t.clientes.id, t.oficinas.clienteFacturacionId))
      .where(and(eq(t.oficinas.id, entrada.oficinaId), eq(t.oficinas.empresaId, empresaId)))
      .for("update", { of: t.oficinas });
    if (!oficina || !abarcaOficina(actor.alcance, { id: oficina.id, canalId: oficina.canalId })) {
      return { ok: false, error: "OFICINA_INEXISTENTE" };
    }
    if (entrada.cuit === oficina.cuitEmpresa) return { ok: false, error: "MISMO_CLIENTE" };
    if (entrada.cuit === (oficina.cuitActual ?? null)) return { ok: false, error: "SIN_CAMBIO" };

    const pendiente = await tx.query.solicitudesFacturacion.findFirst({
      columns: { id: true },
      where: and(
        eq(t.solicitudesFacturacion.oficinaId, oficina.id),
        eq(t.solicitudesFacturacion.estado, "PENDIENTE"),
      ),
    });
    if (pendiente) return { ok: false, error: "YA_PENDIENTE" };

    const [creada] = await tx
      .insert(t.solicitudesFacturacion)
      .values({
        empresaId,
        oficinaId: oficina.id,
        cuit: entrada.cuit,
        comentario: entrada.comentario || null,
        solicitadoPorId: actor.usuarioId,
      })
      .returning({ id: t.solicitudesFacturacion.id });
    const id = creada?.id ?? "";
    const destino = entrada.cuit
      ? `al CUIT ${formatearCuit(entrada.cuit)}`
      : "al cliente de la empresa";
    await registrarAlerta(tx, {
      tipo: "FACTURACION_SOLICITADA",
      clave: `FACTURACION_SOLICITADA:${id}`,
      mensaje: `${oficina.empresa} pide facturar las compras de la oficina ${etiquetaOficina(oficina)} ${destino}.`,
      empresaId,
      paraCliente: false,
    });
    await auditar(tx, {
      actorId: actor.usuarioId,
      entidad: "oficina",
      entidadId: oficina.id,
      empresaId,
      accion: "facturacion_pedido",
      despues: { cuit: entrada.cuit, comentario: entrada.comentario ?? null },
    });
    return { ok: true, id };
  });
}

/** La empresa retira un pedido pendiente (de una oficina de su alcance). */
export async function cancelarPedidoFacturacion(
  db: Db,
  empresaId: string,
  solicitudId: string,
  actor: { usuarioId: string; alcance: Alcance },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [fila] = await tx
      .select({
        id: t.solicitudesFacturacion.id,
        oficinaId: t.oficinas.id,
        canalId: t.oficinas.canalId,
      })
      .from(t.solicitudesFacturacion)
      .innerJoin(t.oficinas, eq(t.oficinas.id, t.solicitudesFacturacion.oficinaId))
      .where(
        and(
          eq(t.solicitudesFacturacion.id, solicitudId),
          eq(t.solicitudesFacturacion.empresaId, empresaId),
          eq(t.solicitudesFacturacion.estado, "PENDIENTE"),
        ),
      )
      .for("update", { of: t.solicitudesFacturacion });
    if (!fila || !abarcaOficina(actor.alcance, { id: fila.oficinaId, canalId: fila.canalId })) {
      return false;
    }
    await tx
      .update(t.solicitudesFacturacion)
      .set({ estado: "CANCELADA", resueltoPorId: actor.usuarioId, resueltoEn: new Date() })
      .where(eq(t.solicitudesFacturacion.id, fila.id));
    // La alerta de SOFTeam ya no hace falta.
    await tx
      .update(t.alertas)
      .set({ estado: "DESCARTADA" })
      .where(eq(t.alertas.claveDeduplicacion, `FACTURACION_SOLICITADA:${fila.id}`));
    return true;
  });
}

/** Pedidos pendientes de las empresas (o de una oficina), con el cliente del CUIT si ya existe. */
export async function pedidosPendientes(db: Ejecutor, empresaIds: readonly string[]) {
  if (empresaIds.length === 0) return [];
  return db
    .select({
      id: t.solicitudesFacturacion.id,
      empresaId: t.solicitudesFacturacion.empresaId,
      oficinaId: t.solicitudesFacturacion.oficinaId,
      cuit: t.solicitudesFacturacion.cuit,
      comentario: t.solicitudesFacturacion.comentario,
      creadoEn: t.solicitudesFacturacion.creadoEn,
      solicitadoPor: t.usuarios.name,
      clienteRegistrado: sql<
        string | null
      >`(select c.nombre_factura from ${t.clientes} c where c.cuit = ${t.solicitudesFacturacion.cuit} and c.activo)`,
    })
    .from(t.solicitudesFacturacion)
    .innerJoin(t.usuarios, eq(t.usuarios.id, t.solicitudesFacturacion.solicitadoPorId))
    .where(
      and(
        inArray(t.solicitudesFacturacion.empresaId, [...empresaIds]),
        eq(t.solicitudesFacturacion.estado, "PENDIENTE"),
      ),
    )
    .orderBy(asc(t.solicitudesFacturacion.creadoEn));
}

export type PedidoFacturacion = Awaited<ReturnType<typeof pedidosPendientes>>[number];

/**
 * SOFTeam aprueba (aplica el cambio: el CUIT tiene que ser de un cliente
 * activo) o rechaza con motivo. La empresa recibe un aviso con el resultado.
 */
export async function resolverPedidoFacturacion(
  db: Db,
  entrada: { solicitudId: string; aprobar: boolean; respuesta?: string | undefined },
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorPedidoFacturacion }> {
  const respuesta = entrada.respuesta?.trim().slice(0, 300) || null;
  if (!entrada.aprobar && !respuesta) return { ok: false, error: "FALTA_MOTIVO" };
  return db.transaction(async (tx) => {
    const [pedido] = await tx
      .select({
        id: t.solicitudesFacturacion.id,
        estado: t.solicitudesFacturacion.estado,
        empresaId: t.solicitudesFacturacion.empresaId,
        oficinaId: t.solicitudesFacturacion.oficinaId,
        cuit: t.solicitudesFacturacion.cuit,
        canalId: t.oficinas.canalId,
        canal: t.canales.codigo,
        codigo: t.oficinas.codigo,
        nombre: t.oficinas.nombre,
      })
      .from(t.solicitudesFacturacion)
      .innerJoin(t.oficinas, eq(t.oficinas.id, t.solicitudesFacturacion.oficinaId))
      .innerJoin(t.canales, eq(t.canales.id, t.oficinas.canalId))
      .where(eq(t.solicitudesFacturacion.id, entrada.solicitudId))
      .for("update", { of: t.solicitudesFacturacion });
    if (!pedido) return { ok: false, error: "NO_EXISTE" };
    if (pedido.estado !== "PENDIENTE") return { ok: false, error: "NO_PENDIENTE" };

    let mensaje: string;
    if (entrada.aprobar) {
      const aplicado = await aplicarFacturacion(
        tx,
        { oficinaId: pedido.oficinaId, cliente: pedido.cuit ?? "" },
        actorId,
      );
      if (!aplicado.ok) return aplicado;
      mensaje = aplicado.cliente
        ? `Aprobamos tu pedido: las compras de la oficina ${etiquetaOficina(pedido)} se facturan a ${aplicado.cliente.nombreFactura}.`
        : `Aprobamos tu pedido: las compras de la oficina ${etiquetaOficina(pedido)} vuelven a facturarse a la empresa.`;
    } else {
      mensaje = `No aprobamos el cambio de facturación de la oficina ${etiquetaOficina(pedido)}: ${respuesta}`;
    }
    await tx
      .update(t.solicitudesFacturacion)
      .set({
        estado: entrada.aprobar ? "APROBADA" : "RECHAZADA",
        resueltoPorId: actorId,
        resueltoEn: new Date(),
        respuesta,
      })
      .where(eq(t.solicitudesFacturacion.id, pedido.id));
    await tx
      .update(t.alertas)
      .set({ estado: "DESCARTADA" })
      .where(eq(t.alertas.claveDeduplicacion, `FACTURACION_SOLICITADA:${pedido.id}`));
    // El aviso llega a quien administra esa oficina (y a la empresa).
    await registrarAlerta(tx, {
      tipo: "FACTURACION_RESUELTA",
      clave: `FACTURACION_RESUELTA:${pedido.id}`,
      mensaje,
      empresaId: pedido.empresaId,
      canalId: pedido.canalId,
      oficinaId: pedido.oficinaId,
      paraSofteam: false,
    });
    await auditar(tx, {
      actorId,
      entidad: "oficina",
      entidadId: pedido.oficinaId,
      empresaId: pedido.empresaId,
      accion: entrada.aprobar ? "facturacion_aprobada" : "facturacion_rechazada",
      despues: { cuit: pedido.cuit, respuesta },
    });
    return { ok: true };
  });
}
