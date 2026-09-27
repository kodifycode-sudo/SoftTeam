import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  type CalculoOrden,
  calcularOrden,
  type RechazoCalculo,
} from "@/domain/facturacion/calculo-orden";
import { alicuotaIva, tipoComprobante } from "@/domain/facturacion/impuestos";
import {
  type Instancia,
  type MedioPago,
  resolverClienteFacturacion,
  validarMedioPago,
} from "@/domain/facturacion/medio-pago";
import { evaluarTicket, type RechazoTicket } from "@/domain/facturacion/ticket";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { estadoInicial, periodoAlta, periodoRenovacion } from "@/domain/licencias/contrato";
import { cantidadContratada } from "@/domain/licencias/licencia";
import { exito, type Resultado, rechazo } from "@/domain/resultado";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { vendibleHoy } from "../catalogo/paquetes";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { type ItemCarrito, listarCarrito } from "./carrito";

export type RechazoCompra =
  | RechazoCalculo
  | RechazoTicket
  | "MEDIO_NO_HABILITADO"
  | "ITEM_NO_DISPONIBLE"
  | "EMPRESA_INEXISTENTE"
  | "YA_RENOVADO";

/**
 * Datos de la empresa, su cliente y su país que definen cómo se cobra. En la
 * compra delegada, también el cliente de facturación de la oficina.
 */
async function contextoVenta(db: Ejecutor, empresaId: string, oficinaId: string | null = null) {
  const [fila] = await db
    .select({
      empresaId: t.empresas.id,
      paisId: t.empresas.paisId,
      tipoCliente: t.empresas.tipoCliente,
      clienteId: t.clientes.id,
      grupoId: t.clientes.grupoId,
      medioPagoAltaId: t.clientes.medioPagoAltaId,
      medioPagoRenovacionId: t.clientes.medioPagoRenovacionId,
      moneda: t.paises.moneda,
      alicuotaGeneral: t.paises.alicuotaIvaGeneral,
    })
    .from(t.empresas)
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .innerJoin(t.paises, eq(t.paises.id, t.empresas.paisId))
    .where(eq(t.empresas.id, empresaId));
  if (!fila) return undefined;

  const [grupo, contratoPrevio, oficina] = await Promise.all([
    fila.grupoId
      ? db.query.gruposEconomicos.findFirst({ where: eq(t.gruposEconomicos.id, fila.grupoId) })
      : undefined,
    db.query.contratos.findFirst({
      columns: { id: true },
      where: and(eq(t.contratos.empresaId, empresaId), ne(t.contratos.estado, "CANCELADO")),
    }),
    oficinaId
      ? db
          .select({ clienteFacturacionId: t.clientes.id })
          .from(t.oficinas)
          .innerJoin(t.clientes, eq(t.clientes.id, t.oficinas.clienteFacturacionId))
          .where(
            and(
              eq(t.oficinas.id, oficinaId),
              eq(t.oficinas.empresaId, empresaId),
              eq(t.clientes.activo, true),
            ),
          )
          .then((filas) => filas[0])
      : undefined,
  ]);
  const instancia: Instancia = contratoPrevio ? "ADICIONAL" : "ALTA_INICIAL";
  return {
    ...fila,
    clienteFacturacionGrupoId: grupo?.clienteFacturacionId ?? null,
    clienteFacturacionOficinaId: oficina?.clienteFacturacionId ?? null,
    instancia,
  };
}

/**
 * Instancia de la compra para los medios de pago: un carrito de solo
 * renovaciones es una renovación; si suma algo nuevo, es un alta o adicional.
 */
const instanciaDe = (items: readonly { tipoAccion: string }[], instancia: Instancia): Instancia =>
  items.length > 0 && items.every((i) => i.tipoAccion === "RENOVACION") ? "RENOVACION" : instancia;

/** Medios de pago utilizables por la empresa en esta instancia (para el checkout). */
export async function mediosParaEmpresa(
  db: Ejecutor,
  empresaId: string,
  items: readonly { tipoAccion: string }[] = [],
) {
  const ctx = await contextoVenta(db, empresaId);
  if (!ctx) return [];
  const instancia = instanciaDe(items, ctx.instancia);
  const medios = await db.select().from(t.mediosPago).orderBy(asc(t.mediosPago.orden));
  return medios.filter((m) => validarMedioPago(m, { paisId: ctx.paisId, instancia }).ok);
}

export interface LineaCotizada {
  item: ItemCarrito;
  descripcion: string;
  calculo: CalculoOrden["items"][number];
}

export interface Cotizacion {
  calculo: CalculoOrden;
  lineas: LineaCotizada[];
  medio: MedioPago & { nombre: string; instrucciones: string | null; generaLink: boolean };
  instancia: Instancia;
  tipoCliente: "DIRECTO" | "CORPORATIVO";
  moneda: string;
  clienteId: string;
  clienteFacturacion: {
    id: string;
    nombre: string;
    condicionIva: (typeof t.clientes.$inferSelect)["condicionIva"];
  };
  tipoComprobante: "A" | "B";
  ticket: { id: string; codigo: string } | null;
}

export const descripcionLinea = (item: ItemCarrito) =>
  `${item.paquete} · ${item.alternativa}${item.cantidad > 1 ? ` ×${item.cantidad}` : ""}`;

/**
 * Cotiza el carrito de una empresa: resuelve medio de pago, cliente de
 * facturación, IVA y ticket, y aplica la cascada de cálculo del dominio. No
 * escribe nada: el carrito y el checkout la usan para mostrar importes, y la
 * confirmación la vuelve a ejecutar dentro de su transacción.
 */
export async function cotizarCarrito(
  db: Ejecutor,
  empresaId: string,
  opciones: {
    medioPagoId?: string | undefined;
    ticketCodigo?: string | undefined;
    /** Compra delegada: cotiza el carrito de esa oficina. */
    oficinaId?: string | null;
  } = {},
  hoy: Fecha = hoyArgentina(),
): Promise<Resultado<Cotizacion, RechazoCompra>> {
  const ctx = await contextoVenta(db, empresaId, opciones.oficinaId ?? null);
  if (!ctx) return rechazo("EMPRESA_INEXISTENTE");

  const items = await listarCarrito(db, empresaId, opciones.oficinaId ?? null);
  if (items.length === 0) return rechazo("SIN_ITEMS");

  // Lo nuevo tiene que seguir a la venta hoy (público y vigente). Una
  // renovación solo exige que la alternativa siga activa, como la automática.
  const vendibles = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(
      and(
        inArray(
          t.alternativas.id,
          items.map((i) => i.alternativaId),
        ),
        eq(t.alternativas.activa, true),
        eq(t.paquetes.paisId, ctx.paisId),
      ),
    );
  const aLaVenta = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(
      and(
        inArray(
          t.alternativas.id,
          items.filter((i) => i.tipoAccion === "ALTA").map((i) => i.alternativaId),
        ),
        eq(t.paquetes.privado, false),
        vendibleHoy(hoy),
      ),
    );
  const noDisponible = items.find(
    (i) =>
      !vendibles.some((v) => v.id === i.alternativaId) ||
      (i.tipoAccion === "ALTA" && !aLaVenta.some((v) => v.id === i.alternativaId)),
  );
  if (noDisponible) return rechazo("ITEM_NO_DISPONIBLE", noDisponible.paquete);

  const instancia = instanciaDe(items, ctx.instancia);
  const medioPreferido =
    instancia === "RENOVACION"
      ? (ctx.medioPagoRenovacionId ?? ctx.medioPagoAltaId)
      : ctx.medioPagoAltaId;
  const candidatos = await db.select().from(t.mediosPago).orderBy(asc(t.mediosPago.orden));
  const validos = candidatos.filter(
    (m) => validarMedioPago(m, { paisId: ctx.paisId, instancia }).ok,
  );
  const medioId =
    opciones.medioPagoId ??
    (validos.some((m) => m.id === medioPreferido) ? medioPreferido : undefined);
  const medio = medioId ? candidatos.find((m) => m.id === medioId) : validos[0];
  const medioValido = validarMedioPago(medio, { paisId: ctx.paisId, instancia });
  if (!medioValido.ok || !medio) return rechazo("MEDIO_NO_HABILITADO");

  const clienteFacturacionId = resolverClienteFacturacion({
    clienteId: ctx.clienteId,
    clienteFacturacionGrupoId: ctx.clienteFacturacionGrupoId,
    clienteFacturacionOficinaId: ctx.clienteFacturacionOficinaId,
    medio,
  });
  const facturacion = await db.query.clientes.findFirst({
    columns: { id: true, nombreFactura: true, condicionIva: true },
    where: eq(t.clientes.id, clienteFacturacionId),
  });
  if (!facturacion) return rechazo("EMPRESA_INEXISTENTE");

  let ticket: Cotizacion["ticket"] = null;
  let ticketAplicable: Parameters<typeof calcularOrden>[0]["ticket"];
  const codigo = opciones.ticketCodigo?.trim().toUpperCase();
  if (codigo) {
    const fila = await db.query.tickets.findFirst({ where: eq(t.tickets.codigo, codigo) });
    const habilitados = fila
      ? await db
          .select({ paqueteId: t.ticketPaquetes.paqueteId })
          .from(t.ticketPaquetes)
          .where(eq(t.ticketPaquetes.ticketId, fila.id))
      : [];
    const evaluado = evaluarTicket({
      ticket: fila && { ...fila, paquetesHabilitados: habilitados.map((h) => h.paqueteId) },
      hoy,
      tipoCliente: ctx.tipoCliente,
      items: items.map((i) => ({
        paqueteId: i.paqueteId,
        tipoAccion: i.tipoAccion,
        bonifPorcentaje: i.tipoAccion === "RENOVACION" ? i.bonifRenovacion : 0n,
      })),
    });
    if (!evaluado.ok) return evaluado;
    ticket = fila ? { id: fila.id, codigo: fila.codigo } : null;
    ticketAplicable = evaluado.valor;
  }

  const calculo = calcularOrden({
    moneda: ctx.moneda,
    items: items.map((i) => ({
      clave: i.id,
      paqueteId: i.paqueteId,
      tipoAccion: i.tipoAccion,
      cantidad: i.cantidad,
      precioCompra: i.precioCompra,
      precioRenovacion: i.precioRenovacion,
      // La bonificación recurrente del contrato se propaga a su renovación.
      bonifPorcentaje: i.tipoAccion === "RENOVACION" ? i.bonifRenovacion : 0n,
      moneda: ctx.moneda,
    })),
    ajustePagoPorcentaje: medio.ajustePorcentaje,
    alicuotaIva: alicuotaIva(facturacion.condicionIva, ctx.alicuotaGeneral),
    ticket: ticketAplicable,
  });
  if (!calculo.ok) return calculo;

  return exito({
    calculo: calculo.valor,
    lineas: items.map((item, i) => ({
      item,
      descripcion: descripcionLinea(item),
      calculo: calculo.valor.items[i] as CalculoOrden["items"][number],
    })),
    medio,
    instancia,
    tipoCliente: ctx.tipoCliente,
    moneda: ctx.moneda,
    clienteId: ctx.clienteId,
    clienteFacturacion: {
      id: facturacion.id,
      nombre: facturacion.nombreFactura,
      condicionIva: facturacion.condicionIva,
    },
    tipoComprobante: tipoComprobante(facturacion.condicionIva),
    ticket,
  });
}

export interface EntradaConfirmacion {
  empresaId: string;
  /** Compra delegada: los contratos quedan asignados a esta oficina. */
  oficinaId?: string | null;
  usuarioId: string;
  medioPagoId?: string | undefined;
  ticketCodigo?: string | undefined;
  /** Generada al mostrar el checkout: un doble envío no crea dos órdenes. */
  claveIdempotencia: string;
}

/**
 * Confirma el carrito como orden, en una sola transacción:
 * recalcula en el servidor (nunca confía en importes del navegador), crea la
 * orden, sus líneas y los contratos con los límites congelados, y vacía el
 * carrito. Los clientes CORPORATIVOS quedan habilitados en el acto
 * (PEND_PAGO_ACTIVO sin límite); los DIRECTOS esperan el pago.
 */
export async function confirmarOrden(
  db: Db,
  entrada: EntradaConfirmacion,
  hoy: Fecha = hoyArgentina(),
): Promise<Resultado<{ ordenId: string; numero: number; repetida: boolean }, RechazoCompra>> {
  return db.transaction(async (tx) => {
    // Serializa las confirmaciones de la misma empresa.
    await tx
      .select({ id: t.empresas.id })
      .from(t.empresas)
      .where(eq(t.empresas.id, entrada.empresaId))
      .for("update");

    const previa = await tx.query.ordenes.findFirst({
      columns: { id: true, numero: true },
      where: eq(t.ordenes.claveIdempotencia, entrada.claveIdempotencia),
    });
    if (previa) return exito({ ordenId: previa.id, numero: previa.numero, repetida: true });

    const cotizacion = await cotizarCarrito(
      tx,
      entrada.empresaId,
      {
        medioPagoId: entrada.medioPagoId,
        ticketCodigo: entrada.ticketCodigo,
        oficinaId: entrada.oficinaId ?? null,
      },
      hoy,
    );
    if (!cotizacion.ok) return cotizacion;
    const c = cotizacion.valor;
    const k = c.calculo;

    // Renovaciones: el contrato sigue vigente y nadie lo renovó mientras
    // estaba en el carrito (por ejemplo, la renovación automática).
    const idsAnteriores = c.lineas.flatMap((l) =>
      l.item.contratoAnteriorId ? [l.item.contratoAnteriorId] : [],
    );
    const anteriores = idsAnteriores.length
      ? await tx
          .select()
          .from(t.contratos)
          .where(
            and(
              inArray(t.contratos.id, idsAnteriores),
              eq(t.contratos.empresaId, entrada.empresaId),
              inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
              sql`not exists (select 1 from ${t.contratos} r where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO')`,
            ),
          )
          .for("update")
      : [];
    const yaRenovado = c.lineas.find(
      (l) =>
        l.item.contratoAnteriorId && !anteriores.some((a) => a.id === l.item.contratoAnteriorId),
    );
    if (yaRenovado) return rechazo("YA_RENOVADO", yaRenovado.item.paquete);

    const [orden] = await tx
      .insert(t.ordenes)
      .values({
        empresaId: entrada.empresaId,
        clienteId: c.clienteId,
        clienteFacturacionId: c.clienteFacturacion.id,
        medioPagoId: c.medio.id,
        moneda: c.moneda,
        condicionIva: c.clienteFacturacion.condicionIva,
        tipoComprobante: c.tipoComprobante,
        subtotalLista: k.subtotalLista,
        bonificacionTotal: k.bonificacionTotal,
        subtotal: k.subtotal,
        ticketId: c.ticket?.id ?? null,
        ticketPorcentaje: k.ticketPorcentaje,
        ticketDescuento: k.ticketDescuento,
        baseNeta: k.baseNeta,
        ajustePagoPorcentaje: k.ajustePagoPorcentaje,
        ajustePago: k.ajustePago,
        netoGravado: k.netoGravado,
        alicuotaIva: k.alicuotaIva,
        iva: k.iva,
        total: k.total,
        claveIdempotencia: entrada.claveIdempotencia,
      })
      .returning({ id: t.ordenes.id, numero: t.ordenes.numero });
    if (!orden) throw new Error("No se pudo crear la orden");

    const estado = estadoInicial(c.tipoCliente);
    const habilitado = estado === "PEND_PAGO_ACTIVO";

    const recursosPorPaquete = await tx
      .select({
        paqueteId: t.paqueteRecursos.paqueteId,
        recursoId: t.paqueteRecursos.recursoId,
        cantidad: t.paqueteRecursos.cantidad,
        clase: t.recursos.clase,
        agregacion: t.recursos.agregacion,
      })
      .from(t.paqueteRecursos)
      .innerJoin(t.recursos, eq(t.recursos.id, t.paqueteRecursos.recursoId))
      .where(
        inArray(
          t.paqueteRecursos.paqueteId,
          c.lineas.map((l) => l.item.paqueteId),
        ),
      );

    for (const { item, descripcion, calculo } of c.lineas) {
      const temporal = item.tipoPaquete === "TEMPORAL";
      const meses = temporal ? item.meses : null;
      const anterior = anteriores.find((a) => a.id === item.contratoAnteriorId);
      // Una renovación empalma con el vencimiento (fechas fijas desde ya, como
      // la automática). Un alta: un corporativo arranca hoy; un directo, al pagar.
      const periodo =
        anterior?.hasta && meses
          ? periodoRenovacion(anterior.hasta, meses)
          : habilitado && temporal && meses
            ? periodoAlta(hoy, meses)
            : null;
      const recurrente = anterior?.bonifRecurrente ?? false;
      const [contrato] = await tx
        .insert(t.contratos)
        .values({
          empresaId: entrada.empresaId,
          oficinaId: anterior ? anterior.oficinaId : (entrada.oficinaId ?? null),
          paqueteId: item.paqueteId,
          alternativaId: item.alternativaId,
          ordenId: orden.id,
          contratoAnteriorId: anterior?.id ?? null,
          tipoAccion: item.tipoAccion,
          tipoPaquete: item.tipoPaquete,
          cantidad: item.cantidad,
          meses,
          estado,
          desde: periodo?.desde ?? (habilitado ? hoy : null),
          hasta: periodo?.hasta ?? null,
          precioLista: calculo.precioLista,
          bonifPorcentaje: recurrente && anterior ? anterior.bonifPorcentaje : 0n,
          bonifRecurrente: recurrente,
          bonifMotivo: recurrente && anterior ? anterior.bonifMotivo : null,
          precioFinal: calculo.precioFinal,
        })
        .returning({ id: t.contratos.id });
      if (!contrato) throw new Error("No se pudo crear el contrato");

      const recursos = recursosPorPaquete.filter(
        (r) => r.paqueteId === item.paqueteId && r.cantidad > 0,
      );
      if (recursos.length) {
        await tx.insert(t.contratoRecursos).values(
          recursos.map((r) => ({
            contratoId: contrato.id,
            recursoId: r.recursoId,
            clase: r.clase,
            cantidad: cantidadContratada(r.cantidad, item.cantidad, r.agregacion),
          })),
        );
      }
      // El saldo de una renovación es del período siguiente: se acredita al pagarla.
      if (habilitado && !anterior) {
        await cargarSaldos(tx, contrato.id, recursos, item.cantidad, "Carga inicial");
      }

      await tx.insert(t.ordenItems).values({
        ordenId: orden.id,
        contratoId: contrato.id,
        descripcion,
        precioLista: calculo.precioLista,
        bonificacion: calculo.bonificacion,
        precioFinal: calculo.precioFinal,
        totalProrrateado: calculo.totalProrrateado,
      });
    }

    await tx.delete(t.carritoItems).where(
      inArray(
        t.carritoItems.id,
        c.lineas.map((l) => l.item.id),
      ),
    );
    // Un corporativo cambia su licencia en el acto: se avisa a los productos.
    if (habilitado) await registrarCambioEmpresa(tx, [entrada.empresaId]);
    await tx.insert(t.auditoria).values({
      actorId: entrada.usuarioId,
      actorTipo: "usuario",
      entidad: "orden",
      empresaId: entrada.empresaId,
      entidadId: orden.id,
      accion: "confirmar",
      despues: {
        numero: orden.numero,
        total: k.total.toString(),
        medio: c.medio.id,
        estadoContratos: estado,
        ...(entrada.oficinaId ? { oficinaId: entrada.oficinaId } : {}),
      },
    });
    return exito({ ordenId: orden.id, numero: orden.numero, repetida: false });
  });
}

/** Acredita el saldo prepago de un contrato (movimientos de CARGA en el libro). */
export async function cargarSaldos(
  tx: Ejecutor,
  contratoId: string,
  recursos: { recursoId: string; cantidad: number; clase: string }[],
  unidades: number,
  observacion: string,
) {
  const saldos = recursos.filter((r) => r.clase === "SALDO" && r.cantidad > 0);
  if (saldos.length === 0) return;
  await tx.insert(t.movimientosSaldo).values(
    saldos.map((r) => ({
      contratoId,
      recursoId: r.recursoId,
      clase: "SALDO" as const,
      tipo: "CARGA" as const,
      creditos: r.cantidad * unidades,
      observacion,
    })),
  );
}
