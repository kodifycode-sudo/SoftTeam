import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { type Centavos, centavos, formatearMoneda } from "@/domain/dinero";
import { calcularOrden } from "@/domain/facturacion/calculo-orden";
import { alicuotaIva, tipoComprobante } from "@/domain/facturacion/impuestos";
import { resolverClienteFacturacion, validarMedioPago } from "@/domain/facturacion/medio-pago";
import { evaluarTicket } from "@/domain/facturacion/ticket";
import { type Fecha, hoy as hoyArgentina, sumarDias, sumarMeses } from "@/domain/fecha";
import { periodoRenovacion } from "@/domain/licencias/contrato";
import { cantidadContratada } from "@/domain/licencias/licencia";
import type { VentanaRenovacion } from "@/domain/procesos/calendario";
import { fechaCorta } from "@/lib/formato";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
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
        tipoCliente: t.empresas.tipoCliente,
      },
      cliente: {
        id: t.clientes.id,
        grupoId: t.clientes.grupoId,
        medioPagoRenovacionId: t.clientes.medioPagoRenovacionId,
        medioPagoAltaId: t.clientes.medioPagoAltaId,
      },
      pais: { moneda: t.paises.moneda, alicuota: t.paises.alicuotaIvaGeneral },
    })
    .from(t.contratos)
    .innerJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
    .innerJoin(t.alternativas, eq(t.alternativas.id, t.contratos.alternativaId))
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .innerJoin(t.paises, eq(t.paises.id, t.empresas.paisId))
    .where(
      and(
        eq(t.contratos.tipoPaquete, "TEMPORAL"),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        eq(t.contratos.noRenovar, false),
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
  agrupada: boolean;
  items: Candidato[];
}

/**
 * Genera las órdenes de renovación de una ventana. Por cada contrato que
 * vence en ella (vigente, sin "no renovar" y sin renovación previa):
 * - precio de renovación vigente de su alternativa; la bonificación se
 *   propaga solo si es recurrente;
 * - medio de pago de renovación del cliente (o el primero habilitado);
 * - el período empalma con el anterior;
 * - planilla: una orden agrupada por cliente de facturación y período; si
 *   no, una orden por empresa.
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

  const porClave = new Map<string, Grupo>();
  for (const c of lista) {
    if (!c.alternativa.activa || !c.alternativa.meses) {
      resumen.omitidos.push({ contratoId: c.contrato.id, motivo: "ALTERNATIVA_NO_DISPONIBLE" });
      continue;
    }
    const contextoMedio = { paisId: c.empresa.paisId, instancia: "RENOVACION" as const };
    const preferido = medios.find(
      (m) => m.id === (c.cliente.medioPagoRenovacionId ?? c.cliente.medioPagoAltaId),
    );
    const medio = validarMedioPago(preferido, contextoMedio).ok
      ? preferido
      : medios.find((m) => validarMedioPago(m, contextoMedio).ok);
    if (!medio) {
      resumen.omitidos.push({ contratoId: c.contrato.id, motivo: "SIN_MEDIO_DE_PAGO" });
      continue;
    }
    const clienteFacturacionId = resolverClienteFacturacion({
      clienteId: c.cliente.id,
      clienteFacturacionGrupoId: c.cliente.grupoId
        ? (grupoDe.get(c.cliente.grupoId) ?? null)
        : null,
      medio,
    });
    const agrupada = medio.planilla;
    const clave = agrupada
      ? `agrupada:${clienteFacturacionId}:${medio.id}`
      : `empresa:${c.empresa.id}:${medio.id}`;
    const grupo = porClave.get(clave) ?? {
      clave,
      medio,
      clienteFacturacionId,
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
 * Ticket de la serie: si la orden que inició la serie usó un ticket, las
 * renovaciones siguen descontando hasta agotar su tope, durante un año desde
 * esa orden (el último mes aplica el remanente). Mismas condiciones que en
 * una compra: sin bonificaciones, no corporativos y solo paquetes habilitados.
 */
async function ticketDeLaSerie(
  tx: Ejecutor,
  grupo: Grupo,
  items: { paqueteId: string; bonifPorcentaje: bigint }[],
) {
  const origenes = new Set(grupo.items.map((i) => i.ordenOrigenId));
  const [origenId] = origenes;
  const primero = grupo.items[0];
  if (origenes.size !== 1 || !origenId || !primero?.contrato.hasta) return undefined;
  const origen = await tx.query.ordenes.findFirst({
    columns: { ticketId: true, emitidaEn: true },
    where: eq(t.ordenes.id, origenId),
  });
  if (!origen?.ticketId) return undefined;
  const ticket = await tx.query.tickets.findFirst({ where: eq(t.tickets.id, origen.ticketId) });
  if (!ticket) return undefined;
  const habilitados = await tx
    .select({ paqueteId: t.ticketPaquetes.paqueteId })
    .from(t.ticketPaquetes)
    .where(eq(t.ticketPaquetes.ticketId, ticket.id));
  const [consumo] = await tx
    .select({ total: sql<string>`coalesce(sum(${t.ordenes.ticketDescuento}), 0)::text` })
    .from(t.ordenes)
    .where(
      and(
        eq(t.ordenes.ticketId, ticket.id),
        sql`${t.ordenes.estado} <> 'CANCELADA'`,
        sql`(${t.ordenes.id} = ${origenId} or ${t.ordenes.ordenOrigenId} = ${origenId})`,
      ),
    );
  const inicioSerie = hoyArgentina(origen.emitidaEn);
  const evaluado = evaluarTicket({
    // La serie vale un año desde la orden original, aunque el ticket ya no se venda.
    ticket: {
      ...ticket,
      vigenteDesde: inicioSerie,
      vigenteHasta: sumarDias(sumarMeses(inicioSerie, 12), -1),
      paquetesHabilitados: habilitados.map((h) => h.paqueteId),
    },
    // Se evalúa a la fecha en que empieza el período renovado.
    hoy: sumarDias(primero.contrato.hasta, 1),
    tipoCliente: primero.empresa.tipoCliente,
    items,
    consumidoSerie: centavos(consumo?.total ?? "0"),
  });
  return evaluado.ok ? { id: ticket.id, aplicable: evaluado.valor } : undefined;
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

    const items = grupo.items.map((i) => ({
      clave: i.contrato.id,
      paqueteId: i.contrato.paqueteId,
      tipoAccion: "RENOVACION" as const,
      cantidad: i.contrato.cantidad,
      precioCompra: i.alternativa.precioCompra,
      precioRenovacion: i.alternativa.precioRenovacion,
      // La bonificación se propaga solo si es recurrente.
      bonifPorcentaje: i.contrato.bonifRecurrente ? i.contrato.bonifPorcentaje : 0n,
      moneda: primero.pais.moneda,
    }));
    const ticket = await ticketDeLaSerie(tx, grupo, items);
    const calculo = calcularOrden({
      moneda: primero.pais.moneda,
      items,
      ajustePagoPorcentaje: grupo.medio.ajustePorcentaje,
      alicuotaIva: alicuotaIva(facturacion.condicionIva, primero.pais.alicuota),
      ticket: ticket?.aplicable,
    });
    if (!calculo.ok) throw new Error(`Cálculo rechazado: ${calculo.error}`);
    const k = calculo.valor;

    const [orden] = await tx
      .insert(t.ordenes)
      .values({
        empresaId: grupo.agrupada ? null : primero.empresa.id,
        clienteId: grupo.agrupada ? grupo.clienteFacturacionId : primero.cliente.id,
        clienteFacturacionId: grupo.clienteFacturacionId,
        medioPagoId: grupo.medio.id,
        tipoGeneracion: "RENOVACION",
        ordenOrigenId: primero.ordenOrigenId,
        agrupada: grupo.agrupada,
        periodo: grupo.agrupada ? ventana.desde.slice(0, 7) : null,
        moneda: primero.pais.moneda,
        condicionIva: facturacion.condicionIva,
        tipoComprobante: tipoComprobante(facturacion.condicionIva),
        subtotalLista: k.subtotalLista,
        bonificacionTotal: k.bonificacionTotal,
        subtotal: k.subtotal,
        ticketId: ticket?.id ?? null,
        ticketPorcentaje: k.ticketPorcentaje,
        ticketDescuento: k.ticketDescuento,
        baseNeta: k.baseNeta,
        ajustePagoPorcentaje: k.ajustePagoPorcentaje,
        ajustePago: k.ajustePago,
        netoGravado: k.netoGravado,
        alicuotaIva: k.alicuotaIva,
        iva: k.iva,
        total: k.total,
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

    const porEmpresa = new Map<string, { nombre: string; paquetes: string[]; hasta: Fecha }>();
    for (const [n, item] of grupo.items.entries()) {
      const anterior = item.contrato;
      const linea = k.items[n];
      if (!linea || !anterior.hasta || !item.alternativa.meses) continue;
      // Corporativo: sigue habilitado sin límite mientras paga. Directo: espera el pago.
      const estado = item.empresa.tipoCliente === "CORPORATIVO" ? "PEND_PAGO_ACTIVO" : "PEND_PAGO";
      const periodo = periodoRenovacion(anterior.hasta, item.alternativa.meses);
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
          desde: periodo.desde,
          hasta: periodo.hasta,
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
        descripcion: `${item.paquete} · renovación${anterior.cantidad > 1 ? ` ×${anterior.cantidad}` : ""}`,
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

    await auditar(tx, {
      ...ACTOR,
      entidad: "orden",
      entidadId: orden.id,
      accion: "renovacion",
      despues: {
        numero: orden.numero,
        ventana: ventana.clave,
        contratos: ids,
        total: k.total.toString(),
        agrupada: grupo.agrupada,
      },
    });
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
