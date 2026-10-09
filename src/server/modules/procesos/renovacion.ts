import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { type Centavos, centavos, formatearMoneda } from "@/domain/dinero";
import { calcularOrden, type ItemEntrada } from "@/domain/facturacion/calculo-orden";
import { medioDisponibleParaEmisor, resolverEmisor } from "@/domain/facturacion/emisor";
import { condicionParaFacturar } from "@/domain/facturacion/impuestos";
import { resolverClienteFacturacion, validarMedioPago } from "@/domain/facturacion/medio-pago";
import {
  aceptaTicket,
  esModoFacturacion,
  estadoInicial,
  type ModoFacturacion,
  medioPermitidoParaModo,
  plazosDeRenovacion,
} from "@/domain/facturacion/modo";
import { saldoDeTicket, ticketHeredable } from "@/domain/facturacion/ticket";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { periodoRenovacion } from "@/domain/licencias/contrato";
import { cantidadContratada } from "@/domain/licencias/licencia";
import { calcularPeriodo } from "@/domain/licencias/periodo";
import type { VentanaRenovacion } from "@/domain/procesos/calendario";
import { fechaCorta } from "@/lib/formato";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { condicionFiscal } from "../catalogo/condiciones-iva";
import { type EmisorDeVenta, emisoresParaVenta } from "../catalogo/emisores";
import { leerParametroDe } from "../parametros";
import { registrarPago } from "../ventas/ordenes";
import { registrarAlerta } from "./alertas";

const ACTOR = { actorId: null, actorTipo: "job:renovacion" } as const;

export interface ResumenRenovacion {
  ventana: string;
  ordenes: number;
  contratos: number;
  omitidos: { contratoId: string; motivo: string }[];
  errores: { grupo: string; error: string }[];
}

/** Contratos que vencen en la ventana y todavía no tienen renovación. */
async function candidatos(db: Ejecutor, ventana: VentanaRenovacion) {
  return db
    .select({
      contrato: t.contratos,
      ordenOrigenId: sql<string>`coalesce(${t.ordenes.ordenOrigenId}, ${t.ordenes.id})`,
      alternativa: {
        meses: t.alternativas.meses,
        precioCompra: t.alternativas.precioCompra,
        precioRenovacion: t.alternativas.precioRenovacion,
        activa: t.alternativas.activa,
      },
      paquete: t.paquetes.nombre,
      empresa: {
        id: t.empresas.id,
        nombre: t.empresas.nombre,
        paisId: t.empresas.paisId,
      },
      cliente: {
        id: t.clientes.id,
        grupoId: t.clientes.grupoId,
        medioPagoRenovacionId: t.clientes.medioPagoRenovacionId,
        medioPagoAltaId: t.clientes.medioPagoAltaId,
      },
      pais: { moneda: t.paises.moneda },
      /** Compra delegada: la renovación se factura igual que la compra. */
      clienteFacturacionOficinaId: sql<
        string | null
      >`(select c.id from ${t.oficinas} o join ${t.clientes} c on c.id = o.cliente_facturacion_id where o.id = ${t.contratos.oficinaId} and c.activo)`,
    })
    .from(t.contratos)
    .leftJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
    .innerJoin(t.alternativas, eq(t.alternativas.id, t.contratos.alternativaId))
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .innerJoin(t.paises, eq(t.paises.id, t.empresas.paisId))
    .where(
      and(
        eq(t.contratos.tipoPaquete, "TEMPORAL"),
        or(
          inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
          // Alta a grupo que espera esta orden colectiva: se cobra con su renovación (8.12).
          and(isNull(t.contratos.ordenId), eq(t.contratos.estado, "PEND_PAGO")),
        ),
        eq(t.contratos.noRenovar, false),
        // El trimestre inicial no tiene día de vencimiento: su continuidad se negocia (8.11).
        isNotNull(t.contratos.diaVenc),
        gte(t.contratos.hasta, ventana.desde),
        lte(t.contratos.hasta, ventana.hasta),
        eq(t.empresas.activa, true),
        eq(t.clientes.activo, true),
        sql`not exists (select 1 from ${t.contratos} r where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO')`,
      ),
    )
    .orderBy(asc(t.contratos.hasta));
}

type Candidato = Awaited<ReturnType<typeof candidatos>>[number];
type Medio = typeof t.mediosPago.$inferSelect;

interface Grupo {
  clave: string;
  medio: Medio;
  clienteFacturacionId: string;
  /** Del cliente de facturación (Mejora v2.1, 7.6). */
  modoFacturacion: ModoFacturacion;
  /** Sociedad que factura (5.11). */
  emisor: EmisorDeVenta;
  agrupada: boolean;
  items: Candidato[];
}

/**
 * Genera las órdenes de renovación de una ventana. Por cada contrato que
 * vence en ella (vigente, sin "no renovar" y sin renovación previa):
 * - precio de renovación vigente de su alternativa; la bonificación se
 *   propaga solo si es recurrente;
 * - medio de pago de renovación del cliente (o el primero habilitado);
 * - el período empalma con el anterior y termina en su día de vencimiento
 *   (10 o 20): si el anterior no estaba alineado, cobra el tramo hasta ese
 *   día (Mejora v2.1, 8.10);
 * - planilla: una orden agrupada por cliente de facturación y período, que
 *   incorpora las altas a grupo pendientes (8.12); si no, una orden por
 *   empresa.
 *
 * Cada orden se crea en su propia transacción, con una clave de idempotencia
 * derivada de sus contratos: reejecutar no duplica, y un error en un grupo no
 * frena a los demás.
 */
export async function procesoRenovacion(
  db: Db,
  ventana: VentanaRenovacion,
): Promise<ResumenRenovacion> {
  const resumen: ResumenRenovacion = {
    ventana: ventana.clave,
    ordenes: 0,
    contratos: 0,
    omitidos: [],
    errores: [],
  };
  const lista = await candidatos(db, ventana);
  if (lista.length === 0) return resumen;

  const medios = await db.select().from(t.mediosPago).orderBy(asc(t.mediosPago.orden));
  const grupos = await db.query.gruposEconomicos.findMany();
  const grupoDe = new Map(grupos.map((g) => [g.id, g.clienteFacturacionId]));
  const posibles = new Set(
    lista.flatMap((c) => [
      c.cliente.id,
      c.clienteFacturacionOficinaId,
      c.cliente.grupoId ? (grupoDe.get(c.cliente.grupoId) ?? null) : null,
    ]),
  );
  posibles.delete(null);
  const facturables = await db
    .select({ id: t.clientes.id, modo: t.clientes.modoFacturacion, emisorId: t.clientes.emisorId })
    .from(t.clientes)
    .where(inArray(t.clientes.id, [...posibles] as string[]));
  const modoDe = new Map(
    facturables.map((c) => [c.id, esModoFacturacion(c.modo) ? c.modo : 0] as const),
  );
  // Emisores asignados y el preferido de cada país de las empresas que renuevan.
  const emisoresPorPais = new Map<string, Awaited<ReturnType<typeof emisoresParaVenta>>>();
  for (const paisId of new Set(lista.map((c) => c.empresa.paisId))) {
    emisoresPorPais.set(
      paisId,
      await emisoresParaVenta(
        db,
        facturables.flatMap((c) => (c.emisorId ? [c.emisorId] : [])),
        paisId,
      ),
    );
  }
  const emisorIdDe = new Map(facturables.map((c) => [c.id, c.emisorId] as const));

  const porClave = new Map<string, Grupo>();
  for (const c of lista) {
    if (!c.alternativa.activa || !c.alternativa.meses) {
      resumen.omitidos.push({ contratoId: c.contrato.id, motivo: "ALTERNATIVA_NO_DISPONIBLE" });
      continue;
    }
    const contextoMedio = { paisId: c.empresa.paisId, instancia: "RENOVACION" as const };
    const facturarA = (m: Medio) =>
      resolverClienteFacturacion({
        clienteId: c.cliente.id,
        clienteFacturacionGrupoId: c.cliente.grupoId
          ? (grupoDe.get(c.cliente.grupoId) ?? null)
          : null,
        clienteFacturacionOficinaId: c.clienteFacturacionOficinaId,
        medio: m,
      });
    const emisores = emisoresPorPais.get(c.empresa.paisId);
    const emisorCon = (m: Medio) => {
      const id = emisorIdDe.get(facturarA(m));
      return resolverEmisor(id ? emisores?.porId.get(id) : undefined, emisores?.preferido);
    };
    // Habilitado para la renovación, el país, el modo del cliente al que se
    // factura y la conexión de su emisor con Mercado Pago.
    const usable = (m: Medio | undefined): m is Medio => {
      if (!m || !validarMedioPago(m, contextoMedio).ok) return false;
      const emisor = emisorCon(m);
      return (
        medioPermitidoParaModo(m.modosFacturacion, modoDe.get(facturarA(m)) ?? 0) &&
        emisor.ok &&
        medioDisponibleParaEmisor(m.tipo, emisor.valor)
      );
    };
    const preferido = medios.find(
      (m) => m.id === (c.cliente.medioPagoRenovacionId ?? c.cliente.medioPagoAltaId),
    );
    const medio = usable(preferido) ? preferido : medios.find(usable);
    if (!medio) {
      resumen.omitidos.push({ contratoId: c.contrato.id, motivo: "SIN_MEDIO_DE_PAGO" });
      continue;
    }
    const clienteFacturacionId = facturarA(medio);
    const emisor = emisorCon(medio);
    if (!emisor.ok) {
      resumen.omitidos.push({ contratoId: c.contrato.id, motivo: "SIN_EMISOR" });
      continue;
    }
    const agrupada = medio.planilla;
    const clave = agrupada
      ? `agrupada:${clienteFacturacionId}:${medio.id}`
      : // Cada oficina con compra delegada renueva en su propia orden.
        `empresa:${c.empresa.id}:${c.contrato.oficinaId ?? "empresa"}:${medio.id}`;
    const grupo = porClave.get(clave) ?? {
      clave,
      medio,
      clienteFacturacionId,
      modoFacturacion: modoDe.get(clienteFacturacionId) ?? 0,
      emisor: emisor.valor,
      agrupada,
      items: [],
    };
    grupo.items.push(c);
    porClave.set(clave, grupo);
  }

  for (const grupo of porClave.values()) {
    try {
      const creada = await generarOrden(db, ventana, grupo);
      if (creada) {
        resumen.ordenes++;
        resumen.contratos += grupo.items.length;
      }
    } catch (e) {
      resumen.errores.push({
        grupo: grupo.clave,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return resumen;
}

/**
 * Ticket heredado de la orden de origen (Mejora v2.1, 9.2 y 9.3): sin
 * revalidarlo, mientras no pasen 12 meses desde esa orden y quede saldo del
 * tope (lo descontado en toda la serie, sin las canceladas). Solo en órdenes
 * de una única serie, sin paquetes bonificados y en modos que aceptan tickets.
 */
async function ticketDeLaSerie(
  tx: Ejecutor,
  grupo: Grupo,
  items: readonly ItemEntrada[],
  hoy: Fecha,
) {
  const series = new Set(grupo.items.map((i) => i.ordenOrigenId));
  const [serie] = series;
  if (grupo.agrupada || series.size !== 1 || !serie || !aceptaTicket(grupo.modoFacturacion)) {
    return null;
  }
  if (items.some((i) => i.bonifPorcentaje > 0n)) return null;
  const origen = await tx.query.ordenes.findFirst({
    columns: { ticketId: true, ticketPorcentaje: true, emitidaEn: true },
    where: eq(t.ordenes.id, serie),
  });
  if (!origen?.ticketId) return null;
  const ticket = await tx.query.tickets.findFirst({
    columns: { id: true, tope: true },
    where: eq(t.tickets.id, origen.ticketId),
  });
  if (!ticket) return null;
  const [consumido] = await tx
    .select({ total: sql<string>`coalesce(sum(${t.ordenes.ticketDescuento}), 0)::text` })
    .from(t.ordenes)
    .where(
      and(
        eq(t.ordenes.ticketId, ticket.id),
        ne(t.ordenes.estado, "CANCELADA"),
        or(eq(t.ordenes.id, serie), eq(t.ordenes.ordenOrigenId, serie)),
      ),
    );
  const saldo = saldoDeTicket(ticket.tope, centavos(consumido?.total ?? "0"));
  if (!ticketHeredable({ emitidaOrigen: hoyArgentina(origen.emitidaEn), hoy, saldo })) return null;
  return { id: ticket.id, aplicable: { porcentaje: origen.ticketPorcentaje, tope: saldo } };
}

async function generarOrden(db: Db, ventana: VentanaRenovacion, grupo: Grupo): Promise<boolean> {
  const ids = grupo.items.map((i) => i.contrato.id).sort();
  const claveIdempotencia = `renovacion:${createHash("sha256")
    .update(`${ventana.clave}|${ids.join(",")}`)
    .digest("base64url")
    .slice(0, 40)}`;

  return db.transaction(async (tx) => {
    const previa = await tx.query.ordenes.findFirst({
      columns: { id: true },
      where: eq(t.ordenes.claveIdempotencia, claveIdempotencia),
    });
    if (previa) return false;

    const primero = grupo.items[0];
    if (!primero) return false;
    const facturacion = await tx.query.clientes.findFirst({
      columns: { id: true, condicionIva: true },
      where: eq(t.clientes.id, grupo.clienteFacturacionId),
    });
    if (!facturacion) throw new Error("Cliente de facturación inexistente");
    const fiscal = condicionParaFacturar(await condicionFiscal(tx, facturacion.condicionIva));
    if (!fiscal.ok) {
      throw new Error(`Condición frente al IVA del cliente de facturación: ${fiscal.error}`);
    }

    const minDiasTramo = await leerParametroDe(tx, "renovacion.minimo_dias_tramo");
    // Los clientes agrupados vencen todos el mismo día.
    const diaGrupo = grupo.agrupada
      ? await leerParametroDe(tx, "renovacion.dia_vencimiento_grupo")
      : null;
    const periodos = grupo.items.map((i) => {
      const hasta = i.contrato.hasta;
      const diaVenc = diaGrupo ?? i.contrato.diaVenc;
      if (!hasta || diaVenc === null || !i.alternativa.meses) return null;
      return calcularPeriodo({
        tipo: "RENOVACION",
        desde: periodoRenovacion(hasta, i.alternativa.meses).desde,
        diaVenc,
        fechaEmision: ventana.corte,
        meses: i.alternativa.meses,
        precioLista: (i.alternativa.precioRenovacion * BigInt(i.contrato.cantidad)) as Centavos,
        minDiasTramo,
      });
    });

    const items: ItemEntrada[] = grupo.items.map((i, n) => ({
      clave: i.contrato.id,
      paqueteId: i.contrato.paqueteId,
      tipoAccion: "RENOVACION" as const,
      cantidad: i.contrato.cantidad,
      precioCompra: i.alternativa.precioCompra,
      precioRenovacion: i.alternativa.precioRenovacion,
      // La bonificación se propaga solo si es recurrente.
      bonifPorcentaje: i.contrato.bonifRecurrente ? i.contrato.bonifPorcentaje : 0n,
      moneda: primero.pais.moneda,
      prorrata: periodos[n]?.prorrataImporte,
    }));

    // Altas a grupo sin orden del mismo cliente de facturación: entran con su
    // tramo (o su precio, si no son temporales), ya grabado en el contrato.
    const pendientes = grupo.agrupada
      ? await tx
          .select({ contrato: t.contratos, paquete: t.paquetes.nombre })
          .from(t.contratos)
          .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
          .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
          .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
          .innerJoin(t.gruposEconomicos, eq(t.gruposEconomicos.id, t.clientes.grupoId))
          .where(
            and(
              isNull(t.contratos.ordenId),
              ne(t.contratos.estado, "CANCELADO"),
              eq(t.gruposEconomicos.clienteFacturacionId, grupo.clienteFacturacionId),
            ),
          )
          .for("update", { of: t.contratos })
      : [];
    for (const p of pendientes) {
      items.push({
        clave: p.contrato.id,
        paqueteId: p.contrato.paqueteId,
        tipoAccion: "ALTA",
        cantidad: p.contrato.cantidad,
        precioCompra: p.contrato.precioLista,
        precioRenovacion: p.contrato.precioLista,
        bonifPorcentaje: 0n,
        moneda: primero.pais.moneda,
        // El importe del alta ya está resuelto en el contrato.
        precioListaResuelto: p.contrato.precioLista,
      });
    }
    const heredado = await ticketDeLaSerie(tx, grupo, items, ventana.corte);
    const calculo = calcularOrden({
      moneda: primero.pais.moneda,
      items,
      ajustePagoPorcentaje: grupo.medio.ajustePorcentaje,
      alicuotaIva: fiscal.valor.alicuota,
      ticket: heredado?.aplicable,
    });
    if (!calculo.ok) throw new Error(`Cálculo rechazado: ${calculo.error}`);
    const k = calculo.valor;

    const [orden] = await tx
      .insert(t.ordenes)
      .values({
        empresaId: grupo.agrupada ? null : primero.empresa.id,
        clienteId: grupo.agrupada ? grupo.clienteFacturacionId : primero.cliente.id,
        clienteFacturacionId: grupo.clienteFacturacionId,
        modoFacturacion: grupo.modoFacturacion,
        emisorId: grupo.emisor.id,
        emisorCuit: grupo.emisor.cuit,
        emisorRazonSocial: grupo.emisor.razonSocial,
        medioPagoId: grupo.medio.id,
        tipoGeneracion: "RENOVACION",
        ordenOrigenId: primero.ordenOrigenId,
        agrupada: grupo.agrupada,
        periodo: grupo.agrupada ? ventana.desde.slice(0, 7) : null,
        moneda: primero.pais.moneda,
        condicionIva: fiscal.valor.codigo,
        codigoArca: fiscal.valor.codigoArca,
        tipoComprobante: fiscal.valor.comprobante,
        subtotalLista: k.subtotalLista,
        bonificacionTotal: k.bonificacionTotal,
        subtotal: k.subtotal,
        baseNeta: k.baseNeta,
        ajustePagoPorcentaje: k.ajustePagoPorcentaje,
        ajustePago: k.ajustePago,
        netoGravado: k.netoGravado,
        alicuotaIva: k.alicuotaIva,
        iva: k.iva,
        total: k.total,
        ticketId: heredado?.id ?? null,
        ticketPorcentaje: k.ticketPorcentaje,
        ticketDescuento: k.ticketDescuento,
        claveIdempotencia,
      })
      .returning({ id: t.ordenes.id, numero: t.ordenes.numero });
    if (!orden) throw new Error("No se pudo crear la orden");

    const recursos = await tx
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
          grupo.items.map((i) => i.contrato.paqueteId),
        ),
      );

    const tolerancia = (await leerParametroDe(tx, "facturacion.tolerancia_dias"))[
      grupo.modoFacturacion
    ];
    const porEmpresa = new Map<string, { nombre: string; paquetes: string[]; hasta: Fecha }>();
    for (const [n, item] of grupo.items.entries()) {
      const anterior = item.contrato;
      const linea = k.items[n];
      const calculado = periodos[n];
      if (!linea || !anterior.hasta || !item.alternativa.meses || !calculado) continue;
      const estado = estadoInicial(grupo.modoFacturacion);
      const periodo = {
        desde: periodoRenovacion(anterior.hasta, item.alternativa.meses).desde,
        hasta: calculado.hasta,
      };
      // Tolerancia de pago (7.7): prórroga del anterior o plazo del nuevo habilitado.
      const plazos = plazosDeRenovacion(
        grupo.modoFacturacion,
        tolerancia,
        anterior.hasta,
        periodo.desde,
      );
      if (plazos.prorrogaAnterior) {
        await tx
          .update(t.contratos)
          .set({ prorrogaHasta: plazos.prorrogaAnterior })
          .where(eq(t.contratos.id, anterior.id));
      }
      const recurrente = anterior.bonifRecurrente;
      const [contrato] = await tx
        .insert(t.contratos)
        .values({
          empresaId: anterior.empresaId,
          oficinaId: anterior.oficinaId,
          paqueteId: anterior.paqueteId,
          alternativaId: anterior.alternativaId,
          ordenId: orden.id,
          contratoAnteriorId: anterior.id,
          tipoAccion: "RENOVACION",
          tipoPaquete: "TEMPORAL",
          cantidad: anterior.cantidad,
          meses: item.alternativa.meses,
          estado,
          pendPagoActivoHasta: estado === "PEND_PAGO_ACTIVO" ? plazos.pendPagoActivoHasta : null,
          desde: periodo.desde,
          hasta: periodo.hasta,
          diaVenc: diaGrupo ?? anterior.diaVenc,
          prorrataHasta: calculado.prorrataDias > 0 ? calculado.fechaObjetivo : null,
          prorrataDias: calculado.prorrataDias,
          prorrataImporte: calculado.prorrataImporte,
          precioLista: linea.precioLista,
          bonifPorcentaje: recurrente ? anterior.bonifPorcentaje : 0n,
          bonifRecurrente: recurrente,
          bonifMotivo: recurrente ? anterior.bonifMotivo : null,
          precioFinal: linea.precioFinal,
        })
        .returning({ id: t.contratos.id });
      if (!contrato) throw new Error("No se pudo crear el contrato");

      const suyos = recursos.filter((r) => r.paqueteId === anterior.paqueteId && r.cantidad > 0);
      if (suyos.length) {
        await tx.insert(t.contratoRecursos).values(
          suyos.map((r) => ({
            contratoId: contrato.id,
            recursoId: r.recursoId,
            clase: r.clase,
            cantidad: cantidadContratada(r.cantidad, anterior.cantidad, r.agregacion),
          })),
        );
      }
      await tx.insert(t.ordenItems).values({
        ordenId: orden.id,
        contratoId: contrato.id,
        descripcion: `${item.paquete} · renovación${anterior.cantidad > 1 ? ` ×${anterior.cantidad}` : ""}${calculado.prorrataDias > 0 ? ` · incluye ${calculado.prorrataDias} días hasta el ${fechaCorta(calculado.fechaObjetivo ?? periodo.desde)}` : ""}`,
        precioLista: linea.precioLista,
        bonificacion: linea.bonificacion,
        precioFinal: linea.precioFinal,
        totalProrrateado: linea.totalProrrateado,
      });

      const resumen = porEmpresa.get(item.empresa.id) ?? {
        nombre: item.empresa.nombre,
        paquetes: [],
        hasta: anterior.hasta,
      };
      resumen.paquetes.push(item.paquete);
      if (anterior.hasta < resumen.hasta) resumen.hasta = anterior.hasta;
      porEmpresa.set(item.empresa.id, resumen);
    }

    for (const [j, p] of pendientes.entries()) {
      const linea = k.items[grupo.items.length + j];
      if (!linea) continue;
      await tx
        .update(t.contratos)
        .set({ ordenId: orden.id })
        .where(eq(t.contratos.id, p.contrato.id));
      const { prorrataDias, prorrataHasta } = p.contrato;
      await tx.insert(t.ordenItems).values({
        ordenId: orden.id,
        contratoId: p.contrato.id,
        descripcion: `${p.paquete} · alta${p.contrato.cantidad > 1 ? ` ×${p.contrato.cantidad}` : ""}${
          prorrataDias > 0 && prorrataHasta
            ? ` · ${prorrataDias} días hasta el ${fechaCorta(prorrataHasta)}`
            : ""
        }`,
        precioLista: linea.precioLista,
        bonificacion: linea.bonificacion,
        precioFinal: linea.precioFinal,
        totalProrrateado: linea.totalProrrateado,
      });
    }

    await auditar(tx, {
      ...ACTOR,
      entidad: "orden",
      empresaId: grupo.agrupada ? null : primero.empresa.id,
      entidadId: orden.id,
      accion: "renovacion",
      despues: {
        numero: orden.numero,
        ventana: ventana.clave,
        contratos: ids,
        altasAGrupo: pendientes.map((p) => p.contrato.id),
        total: k.total.toString(),
        agrupada: grupo.agrupada,
      },
    });
    // Sin importe (bonificación recurrente del 100 %): queda pagada, sin aviso de cobro.
    if (k.total === 0n) {
      await registrarPago(tx, orden.id, null, undefined, { actorTipo: ACTOR.actorTipo });
      return true;
    }
    for (const [empresaId, r] of porEmpresa) {
      await registrarAlerta(tx, {
        tipo: "RENOVACION_GENERADA",
        clave: `RENOVACION_GENERADA:${orden.id}:${empresaId}`,
        mensaje: `Generamos la orden #${orden.numero} para renovar ${r.paquetes.join(", ")}${
          grupo.agrupada ? "" : ` por ${formatearMoneda(k.total as Centavos)}`
        }. Vence el ${fechaCorta(r.hasta)}: pagala antes para no cortar el servicio.`,
        empresaId,
        ordenId: grupo.agrupada ? null : orden.id,
        paraSofteam: false,
      });
    }
    return true;
  });
}
