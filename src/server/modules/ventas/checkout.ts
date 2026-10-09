import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Centavos } from "@/domain/dinero";
import {
  type CalculoOrden,
  calcularOrden,
  type RechazoCalculo,
} from "@/domain/facturacion/calculo-orden";
import { medioDisponibleParaEmisor, resolverEmisor } from "@/domain/facturacion/emisor";
import { condicionParaFacturar, type RechazoCondicion } from "@/domain/facturacion/impuestos";
import {
  type Instancia,
  type MedioPago,
  resolverClienteFacturacion,
  validarMedioPago,
} from "@/domain/facturacion/medio-pago";
import {
  esModoFacturacion,
  estadoInicial,
  type ModoFacturacion,
  medioPermitidoParaModo,
  plazoDeAlta,
  plazosDeRenovacion,
} from "@/domain/facturacion/modo";
import { evaluarTicket, type RechazoTicket } from "@/domain/facturacion/ticket";
import { esPosterior, type Fecha, hoy as hoyArgentina, sumarDias } from "@/domain/fecha";
import { periodoAlta, periodoRenovacion } from "@/domain/licencias/contrato";
import { cantidadContratada } from "@/domain/licencias/licencia";
import {
  calcularPeriodo,
  type PeriodoCalculado,
  planPermitido,
  type SituacionAlta,
  situacionAlta,
} from "@/domain/licencias/periodo";
import { exito, type Resultado, rechazo } from "@/domain/resultado";
import { fechaCorta } from "@/lib/formato";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { condicionFiscal } from "../catalogo/condiciones-iva";
import { type EmisorDeVenta, emisoresParaVenta } from "../catalogo/emisores";
import { vendibleHoy } from "../catalogo/paquetes";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { leerParametroDe } from "../parametros";
import { type ItemCarrito, listarCarrito } from "./carrito";
import { cargarSaldos, registrarPago } from "./ordenes";

export type RechazoCompra =
  | RechazoCalculo
  | RechazoTicket
  | RechazoCondicion
  | "MEDIO_NO_HABILITADO"
  | "ITEM_NO_DISPONIBLE"
  | "EMPRESA_INEXISTENTE"
  | "SIN_EMISOR"
  | "YA_RENOVADO"
  | "PLAN_NO_PERMITIDO"
  | "DIA_INVALIDO"
  | "ALTA_A_GRUPO";

/**
 * Datos de la empresa, su cliente y su país que definen cómo se cobra. En la
 * compra delegada, también el cliente de facturación de la oficina.
 */
async function contextoVenta(db: Ejecutor, empresaId: string, oficinaId: string | null = null) {
  const [fila] = await db
    .select({
      empresaId: t.empresas.id,
      paisId: t.empresas.paisId,
      clienteId: t.clientes.id,
      grupoId: t.clientes.grupoId,
      medioPagoAltaId: t.clientes.medioPagoAltaId,
      medioPagoRenovacionId: t.clientes.medioPagoRenovacionId,
      moneda: t.paises.moneda,
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
  // Vencimientos de los paquetes temporales no cancelados: de la empresa para
  // los adicionales y de todo el grupo para las altas a grupo (8.10 y 8.12).
  const temporales = await db
    .select({
      empresaId: t.contratos.empresaId,
      hasta: t.contratos.hasta,
      diaVenc: t.contratos.diaVenc,
    })
    .from(t.contratos)
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .where(
      and(
        eq(t.contratos.tipoPaquete, "TEMPORAL"),
        ne(t.contratos.estado, "CANCELADO"),
        isNotNull(t.contratos.hasta),
        fila.grupoId ? eq(t.clientes.grupoId, fila.grupoId) : eq(t.empresas.id, empresaId),
      ),
    );
  const clienteFacturacionGrupoId = grupo?.clienteFacturacionId ?? null;
  const clienteFacturacionOficinaId = oficina?.clienteFacturacionId ?? null;
  const posibles = [fila.clienteId, clienteFacturacionGrupoId, clienteFacturacionOficinaId].filter(
    (id): id is string => id !== null,
  );
  const facturables = await db
    .select({ id: t.clientes.id, modo: t.clientes.modoFacturacion, emisorId: t.clientes.emisorId })
    .from(t.clientes)
    .where(inArray(t.clientes.id, posibles));
  const modos = new Map(
    facturables.map((c) => [c.id, esModoFacturacion(c.modo) ? c.modo : 0] as const),
  );
  const emisores = await emisoresParaVenta(
    db,
    facturables.flatMap((c) => (c.emisorId ? [c.emisorId] : [])),
    fila.paisId,
  );
  const emisorDe = new Map(
    facturables.map(
      (c) => [c.id, c.emisorId ? emisores.porId.get(c.emisorId) : undefined] as const,
    ),
  );
  return {
    ...fila,
    clienteFacturacionGrupoId,
    clienteFacturacionOficinaId,
    instancia,
    temporales,
    modos,
    emisorDe,
    emisorPreferido: emisores.preferido,
  };
}

type ContextoVenta = NonNullable<Awaited<ReturnType<typeof contextoVenta>>>;

/**
 * Modo con que se cobraría la orden pagando con este medio: el del cliente al
 * que se factura (con planilla, el del grupo; Mejora v2.1, 7.6).
 */
function modoConMedio(ctx: ContextoVenta, medio: MedioPago): ModoFacturacion {
  return ctx.modos.get(facturarA(ctx, medio)) ?? 0;
}

const facturarA = (ctx: ContextoVenta, medio: MedioPago) =>
  resolverClienteFacturacion({
    clienteId: ctx.clienteId,
    clienteFacturacionGrupoId: ctx.clienteFacturacionGrupoId,
    clienteFacturacionOficinaId: ctx.clienteFacturacionOficinaId,
    medio,
  });

/** Emisor de la venta con este medio: el del cliente al que se factura o el preferido (5.11). */
const emisorConMedio = (ctx: ContextoVenta, medio: MedioPago) =>
  resolverEmisor(ctx.emisorDe.get(facturarA(ctx, medio)), ctx.emisorPreferido);

/** Medio utilizable: activo, del país, de la instancia y habilitado para el modo de facturación. */
function medioUsable(
  ctx: ContextoVenta,
  medio: (MedioPago & { modosFacturacion: number[] }) | undefined,
  instancia: Instancia,
): medio is MedioPago & { modosFacturacion: number[] } {
  if (!medio || !validarMedioPago(medio, { paisId: ctx.paisId, instancia }).ok) return false;
  const emisor = emisorConMedio(ctx, medio);
  return (
    medioPermitidoParaModo(medio.modosFacturacion, modoConMedio(ctx, medio)) &&
    emisor.ok &&
    medioDisponibleParaEmisor(medio.tipo, emisor.valor)
  );
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
  return medios.filter((m) => medioUsable(ctx, m, instancia));
}

export interface LineaCotizada {
  item: ItemCarrito;
  descripcion: string;
  calculo: CalculoOrden["items"][number];
  /** Paquetes temporales alineados: tramo y vencimiento (Mejora v2.1, 8.10). */
  periodo: PeriodoCalculado | null;
}

export interface Cotizacion {
  calculo: CalculoOrden;
  lineas: LineaCotizada[];
  medio: MedioPago & { nombre: string; instrucciones: string | null; generaLink: boolean };
  instancia: Instancia;
  /** Modo de facturación del cliente al que se factura. */
  modoFacturacion: ModoFacturacion;
  /** Sociedad que factura, congelada en la orden. */
  emisor: Pick<EmisorDeVenta, "id" | "cuit" | "razonSocial">;
  moneda: string;
  clienteId: string;
  clienteFacturacion: {
    id: string;
    nombre: string;
    condicionIva: string;
    codigoArca: number;
  };
  tipoComprobante: "A" | "B";
  ticket: { id: string; codigo: string } | null;
  situacion: SituacionAlta;
  /** Día de vencimiento de los temporales de la orden. `null`: trimestre inicial. */
  diaVenc: number | null;
  /** Días que se pueden elegir; vacío si el día está fijado (grupo o trimestre). */
  diasVenc: number[];
}

export const descripcionLinea = (item: ItemCarrito, periodo: PeriodoCalculado | null = null) =>
  `${item.paquete} · ${item.alternativa}${item.cantidad > 1 ? ` ×${item.cantidad}` : ""}${
    periodo && periodo.prorrataDias > 0 && periodo.fechaObjetivo
      ? ` · ${periodo.incluyePeriodo ? "incluye " : ""}${periodo.prorrataDias} días hasta el ${fechaCorta(periodo.fechaObjetivo)}`
      : ""
  }`;

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
    /** Día de vencimiento elegido (único por orden). */
    diaVenc?: number | undefined;
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

  // Sin emisor (ninguno asignado ni preferido para el país) no se puede vender.
  if (!resolverEmisor(ctx.emisorDe.get(ctx.clienteId), ctx.emisorPreferido).ok) {
    return rechazo("SIN_EMISOR");
  }
  const instancia = instanciaDe(items, ctx.instancia);
  const medioPreferido =
    instancia === "RENOVACION"
      ? (ctx.medioPagoRenovacionId ?? ctx.medioPagoAltaId)
      : ctx.medioPagoAltaId;
  const candidatos = await db.select().from(t.mediosPago).orderBy(asc(t.mediosPago.orden));
  const validos = candidatos.filter((m) => medioUsable(ctx, m, instancia));
  const medioId =
    opciones.medioPagoId ??
    (validos.some((m) => m.id === medioPreferido) ? medioPreferido : undefined);
  const medio = medioId ? candidatos.find((m) => m.id === medioId) : validos[0];
  if (!medioUsable(ctx, medio, instancia)) return rechazo("MEDIO_NO_HABILITADO");
  const modoFacturacion = modoConMedio(ctx, medio);
  const emisor = emisorConMedio(ctx, medio);
  if (!emisor.ok) return rechazo("SIN_EMISOR");

  // Plan y día de vencimiento (Mejora v2.1, 8.9 a 8.18).
  const empresaTemporales = ctx.temporales.filter((c) => c.empresaId === empresaId);
  const situacion = situacionAlta({
    agrupado: ctx.clienteFacturacionGrupoId !== null,
    planilla: medio.planilla,
    tieneTemporales: empresaTemporales.length > 0,
  });
  const noPermitido = items.find(
    (i) =>
      i.tipoPaquete === "TEMPORAL" &&
      i.meses !== null &&
      !planPermitido(i.meses, i.tipoAccion, situacion),
  );
  if (noPermitido) return rechazo("PLAN_NO_PERMITIDO", noPermitido.paquete);
  const [diasVenc, diaGrupo, minDiasTramo, diasCorte] = await Promise.all([
    leerParametroDe(db, "renovacion.dias_vencimiento"),
    leerParametroDe(db, "renovacion.dia_vencimiento_grupo"),
    leerParametroDe(db, "renovacion.minimo_dias_tramo"),
    leerParametroDe(db, "renovacion.dias_corte"),
  ]);
  const enTrimestre =
    situacion === "ADICIONAL" &&
    empresaTemporales.length > 0 &&
    empresaTemporales.every((c) => c.diaVenc === null);
  const fijo = ctx.clienteFacturacionGrupoId !== null;
  const hayTemporales = items.some((i) => i.tipoPaquete === "TEMPORAL");
  // Se propone el día de los otros paquetes del cliente o el de la renovación.
  const propuesto =
    empresaTemporales.find((c) => c.diaVenc !== null)?.diaVenc ??
    items.find((i) => i.anteriorDiaVenc !== null)?.anteriorDiaVenc ??
    diasVenc[0];
  const eligeDia = hayTemporales && !fijo && !enTrimestre && situacion !== "TRIMESTRE_INICIAL";
  if (opciones.diaVenc !== undefined && !(diasVenc as number[]).includes(opciones.diaVenc)) {
    return rechazo("DIA_INVALIDO");
  }
  const diaVenc: number | null =
    situacion === "TRIMESTRE_INICIAL" || enTrimestre
      ? null
      : fijo
        ? diaGrupo
        : (opciones.diaVenc ?? propuesto);
  const mayorHasta = (dia: number | null, de: typeof ctx.temporales) =>
    de
      .filter((c) => c.diaVenc === dia && c.hasta)
      .reduce<Fecha | null>((m, c) => (!m || esPosterior(c.hasta as Fecha, m) ? c.hasta : m), null);
  const periodos = items.map((i): PeriodoCalculado | null => {
    if (i.tipoPaquete !== "TEMPORAL" || !i.meses) return null;
    const precioLista = ((i.tipoAccion === "ALTA" ? i.precioCompra : i.precioRenovacion) *
      BigInt(i.cantidad)) as Centavos;
    const base = { fechaEmision: hoy, meses: i.meses, precioLista, minDiasTramo };
    if (i.tipoAccion === "RENOVACION") {
      if (!i.anteriorHasta || diaVenc === null) return null;
      return calcularPeriodo({
        ...base,
        tipo: "RENOVACION",
        desde: sumarDias(i.anteriorHasta, 1),
        diaVenc,
      });
    }
    if (situacion === "TRIMESTRE_INICIAL") return null;
    if (situacion === "GRUPO") {
      return calcularPeriodo({
        ...base,
        tipo: "ALTA_GRUPO",
        desde: hoy,
        diaVenc,
        mayorHasta: mayorHasta(diaVenc, ctx.temporales),
        diaCorteColectiva: diasCorte[0],
      });
    }
    return calcularPeriodo({
      ...base,
      tipo: "ALTA_ADICIONAL",
      desde: hoy,
      diaVenc,
      mayorHasta: mayorHasta(diaVenc, empresaTemporales),
    });
  });

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
  const fiscal = condicionParaFacturar(await condicionFiscal(db, facturacion.condicionIva));
  if (!fiscal.ok) return fiscal;

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
      modoFacturacion,
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
    items: items.map((i, n) => ({
      clave: i.id,
      paqueteId: i.paqueteId,
      tipoAccion: i.tipoAccion,
      cantidad: i.cantidad,
      precioCompra: i.precioCompra,
      precioRenovacion: i.precioRenovacion,
      // La bonificación recurrente del contrato se propaga a su renovación.
      bonifPorcentaje: i.tipoAccion === "RENOVACION" ? i.bonifRenovacion : 0n,
      moneda: ctx.moneda,
      prorrata: periodos[n]?.prorrataImporte,
      incluyePeriodo: periodos[n]?.incluyePeriodo,
    })),
    ajustePagoPorcentaje: medio.ajustePorcentaje,
    alicuotaIva: fiscal.valor.alicuota,
    ticket: ticketAplicable,
  });
  if (!calculo.ok) return calculo;

  return exito({
    calculo: calculo.valor,
    lineas: items.map((item, i) => ({
      item,
      descripcion: descripcionLinea(item, periodos[i] ?? null),
      calculo: calculo.valor.items[i] as CalculoOrden["items"][number],
      periodo: periodos[i] ?? null,
    })),
    medio,
    instancia,
    modoFacturacion,
    emisor: {
      id: emisor.valor.id,
      cuit: emisor.valor.cuit,
      razonSocial: emisor.valor.razonSocial,
    },
    moneda: ctx.moneda,
    clienteId: ctx.clienteId,
    clienteFacturacion: {
      id: facturacion.id,
      nombre: facturacion.nombreFactura,
      condicionIva: fiscal.valor.codigo,
      codigoArca: fiscal.valor.codigoArca,
    },
    tipoComprobante: fiscal.valor.comprobante,
    ticket,
    situacion,
    diaVenc,
    diasVenc: eligeDia ? [...diasVenc] : [],
  });
}

export interface EntradaConfirmacion {
  empresaId: string;
  /** Compra delegada: los contratos quedan asignados a esta oficina. */
  oficinaId?: string | null;
  usuarioId: string;
  medioPagoId?: string | undefined;
  ticketCodigo?: string | undefined;
  diaVenc?: number | undefined;
  /** Generada al mostrar el checkout: un doble envío no crea dos órdenes. */
  claveIdempotencia: string;
}

/** Tramo prorrateado que se graba en el contrato. */
const datosProrrata = (p: PeriodoCalculado | null) => ({
  prorrataHasta: p && p.prorrataDias > 0 ? p.fechaObjetivo : null,
  prorrataDias: p?.prorrataDias ?? 0,
  prorrataImporte: p?.prorrataImporte ?? (0n as Centavos),
});

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
        diaVenc: entrada.diaVenc,
      },
      hoy,
    );
    if (!cotizacion.ok) return cotizacion;
    const c = cotizacion.valor;
    const k = c.calculo;
    // Un alta a grupo no genera orden: la incorpora la orden colectiva (8.12).
    if (c.situacion === "GRUPO") return rechazo("ALTA_A_GRUPO");

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
        modoFacturacion: c.modoFacturacion,
        emisorId: c.emisor.id,
        emisorCuit: c.emisor.cuit,
        emisorRazonSocial: c.emisor.razonSocial,
        medioPagoId: c.medio.id,
        moneda: c.moneda,
        condicionIva: c.clienteFacturacion.condicionIva,
        codigoArca: c.clienteFacturacion.codigoArca,
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

    const estado = estadoInicial(c.modoFacturacion);
    const habilitado = estado === "PEND_PAGO_ACTIVO";
    const tolerancia = (await leerParametroDe(tx, "facturacion.tolerancia_dias"))[
      c.modoFacturacion
    ];

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

    for (const { item, descripcion, calculo, periodo: alineado } of c.lineas) {
      const temporal = item.tipoPaquete === "TEMPORAL";
      const meses = temporal ? item.meses : null;
      const anterior = anteriores.find((a) => a.id === item.contratoAnteriorId);
      // Una renovación empalma con el vencimiento y un adicional arranca hoy,
      // los dos hasta su día de vencimiento (fechas fijas desde ya, como la
      // automática). El trimestre inicial: un corporativo arranca hoy; un
      // directo, al pagar.
      const periodo =
        anterior?.hasta && meses
          ? {
              desde: periodoRenovacion(anterior.hasta, meses).desde,
              hasta: alineado?.hasta ?? periodoRenovacion(anterior.hasta, meses).hasta,
            }
          : alineado
            ? { desde: hoy, hasta: alineado.hasta }
            : habilitado && temporal && meses
              ? periodoAlta(hoy, meses)
              : null;
      const recurrente = anterior?.bonifRecurrente ?? false;
      // Tolerancia de pago (7.7): prórroga del anterior o plazo del nuevo habilitado.
      const plazos =
        anterior?.hasta && periodo
          ? plazosDeRenovacion(c.modoFacturacion, tolerancia, anterior.hasta, periodo.desde)
          : {
              prorrogaAnterior: null,
              pendPagoActivoHasta: plazoDeAlta(c.modoFacturacion, tolerancia, hoy),
            };
      if (anterior && plazos.prorrogaAnterior) {
        await tx
          .update(t.contratos)
          .set({ prorrogaHasta: plazos.prorrogaAnterior })
          .where(eq(t.contratos.id, anterior.id));
      }
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
          pendPagoActivoHasta: habilitado ? plazos.pendPagoActivoHasta : null,
          desde: periodo?.desde ?? (habilitado ? hoy : null),
          hasta: periodo?.hasta ?? null,
          diaVenc: temporal ? c.diaVenc : null,
          ...datosProrrata(alineado),
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
    // Sin importe (paquetes bonificados al 100 %): queda pagada en el acto, sin link ni factura.
    if (k.total === 0n) {
      await registrarPago(tx, orden.id, entrada.usuarioId, hoy, { actorTipo: "sistema" });
    }
    return exito({ ordenId: orden.id, numero: orden.numero, repetida: false });
  });
}

/**
 * Alta a grupo (Mejora v2.1, 8.12): el cliente agrupado que paga por planilla
 * no genera una orden en el momento. Los paquetes se graban con su tramo,
 * sin orden, y la orden colectiva de la próxima corrida los incorpora (una
 * orden por factura). Mientras tanto, Administración puede anularlos.
 */
export async function confirmarAltaAGrupo(
  db: Db,
  entrada: Omit<EntradaConfirmacion, "claveIdempotencia">,
  hoy: Fecha = hoyArgentina(),
): Promise<Resultado<{ contratos: number }, RechazoCompra>> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: t.empresas.id })
      .from(t.empresas)
      .where(eq(t.empresas.id, entrada.empresaId))
      .for("update");
    const cotizacion = await cotizarCarrito(
      tx,
      entrada.empresaId,
      { medioPagoId: entrada.medioPagoId, oficinaId: entrada.oficinaId ?? null },
      hoy,
    );
    if (!cotizacion.ok) return cotizacion;
    const c = cotizacion.valor;
    if (c.situacion !== "GRUPO") return rechazo("MEDIO_NO_HABILITADO");
    // Las renovaciones de un grupo las genera la corrida colectiva.
    const renovacion = c.lineas.find((l) => l.item.tipoAccion === "RENOVACION");
    if (renovacion) return rechazo("ITEM_NO_DISPONIBLE", renovacion.item.paquete);

    const estado = estadoInicial(c.modoFacturacion);
    const habilitado = estado === "PEND_PAGO_ACTIVO";
    const tolerancia = (await leerParametroDe(tx, "facturacion.tolerancia_dias"))[
      c.modoFacturacion
    ];
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

    for (const { item, calculo, periodo } of c.lineas) {
      const temporal = item.tipoPaquete === "TEMPORAL";
      const [contrato] = await tx
        .insert(t.contratos)
        .values({
          empresaId: entrada.empresaId,
          oficinaId: entrada.oficinaId ?? null,
          paqueteId: item.paqueteId,
          alternativaId: item.alternativaId,
          ordenId: null,
          tipoAccion: "ALTA",
          tipoPaquete: item.tipoPaquete,
          cantidad: item.cantidad,
          meses: temporal ? item.meses : null,
          estado,
          pendPagoActivoHasta: habilitado ? plazoDeAlta(c.modoFacturacion, tolerancia, hoy) : null,
          desde: temporal || habilitado ? hoy : null,
          hasta: periodo?.hasta ?? null,
          diaVenc: temporal ? c.diaVenc : null,
          ...datosProrrata(periodo),
          precioLista: calculo.precioLista,
          bonifPorcentaje: 0n,
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
      if (habilitado) {
        await cargarSaldos(tx, contrato.id, recursos, item.cantidad, "Carga inicial");
      }
    }

    await tx.delete(t.carritoItems).where(
      inArray(
        t.carritoItems.id,
        c.lineas.map((l) => l.item.id),
      ),
    );
    if (habilitado) await registrarCambioEmpresa(tx, [entrada.empresaId]);
    await tx.insert(t.auditoria).values({
      actorId: entrada.usuarioId,
      actorTipo: "usuario",
      entidad: "empresa",
      empresaId: entrada.empresaId,
      entidadId: entrada.empresaId,
      accion: "alta_a_grupo",
      despues: {
        paquetes: c.lineas.map((l) => l.descripcion),
        estadoContratos: estado,
        diaVenc: c.diaVenc,
      },
    });
    return exito({ contratos: c.lineas.length });
  });
}

/**
 * Planes temporales que la empresa puede contratar hoy (8.18): solo el
 * trimestral en el primer alta de un cliente no agrupado; después, el resto.
 * Para filtrar el catálogo; la cotización lo vuelve a validar.
 */
export async function soloTrimestralInicial(db: Ejecutor, empresaId: string): Promise<boolean> {
  const ctx = await contextoVenta(db, empresaId);
  if (!ctx) return false;
  return (
    situacionAlta({
      agrupado: ctx.clienteFacturacionGrupoId !== null,
      planilla: false,
      tieneTemporales: ctx.temporales.some((c) => c.empresaId === empresaId),
    }) === "TRIMESTRE_INICIAL"
  );
}
