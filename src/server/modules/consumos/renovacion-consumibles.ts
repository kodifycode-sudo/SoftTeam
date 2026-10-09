import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { familiaConProductoVivo, saldoParaRenovar } from "@/domain/consumos/consumibles";
import { FAMILIAS, FAMILIAS_CONSUMO, type FamiliaConsumo } from "@/domain/consumos/familias";
import type { Centavos } from "@/domain/dinero";
import { formatearMoneda } from "@/domain/dinero";
import { calcularOrden } from "@/domain/facturacion/calculo-orden";
import { medioDisponibleParaEmisor, resolverEmisor } from "@/domain/facturacion/emisor";
import { condicionParaFacturar } from "@/domain/facturacion/impuestos";
import { resolverClienteFacturacion, validarMedioPago } from "@/domain/facturacion/medio-pago";
import {
  esModoFacturacion,
  estadoInicial,
  medioPermitidoParaModo,
  plazoDeAlta,
} from "@/domain/facturacion/modo";
import { type Fecha, hoy as hoyArgentina } from "@/domain/fecha";
import { cantidadContratada } from "@/domain/licencias/licencia";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { condicionFiscal } from "../catalogo/condiciones-iva";
import { emisoresParaVenta } from "../catalogo/emisores";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { licenciaDeEmpresa } from "../licencias/licencia-empresa";
import { leerParametroDe } from "../parametros";
import { registrarAlerta } from "../procesos/alertas";
import { cargarSaldos, registrarPago } from "../ventas/ordenes";

const ACTOR = { actorId: null, actorTipo: "job:consumibles" } as const;

/** Recurso de saldo prepago de cada familia que se renueva por saldo (8.15). */
const FAMILIA_DE_SALDO = new Map<string, FamiliaConsumo>(
  FAMILIAS.map((f) => [FAMILIAS_CONSUMO[f].saldo, f]),
);

export interface ResumenConsumibles {
  renovados: number;
  omitidos: { contratoId: string; motivo: string }[];
}

/** Consumibles vigentes con renovación automática y sin renovación generada. */
async function candidatos(db: Db, empresaId: string | undefined) {
  return db
    .select({
      contrato: t.contratos,
      recursoId: t.contratoRecursos.recursoId,
      cantidadRecurso: t.contratoRecursos.cantidad,
      saldo: t.contratoRecursos.saldo,
      alternativa: {
        activa: t.alternativas.activa,
        precioCompra: t.alternativas.precioCompra,
        precioRenovacion: t.alternativas.precioRenovacion,
      },
      paquete: t.paquetes.nombre,
      empresa: { id: t.empresas.id, nombre: t.empresas.nombre, paisId: t.empresas.paisId },
      cliente: {
        id: t.clientes.id,
        grupoId: t.clientes.grupoId,
        medioPagoRenovacionId: t.clientes.medioPagoRenovacionId,
      },
      moneda: t.paises.moneda,
      medioAnteriorId: t.ordenes.medioPagoId,
      ordenOrigenId: sql<string | null>`coalesce(${t.ordenes.ordenOrigenId}, ${t.ordenes.id})`,
      /** Compra delegada: se factura igual que la compra. */
      clienteFacturacionOficinaId: sql<
        string | null
      >`(select c.id from ${t.oficinas} o join ${t.clientes} c on c.id = o.cliente_facturacion_id where o.id = ${t.contratos.oficinaId} and c.activo)`,
    })
    .from(t.contratos)
    .innerJoin(t.contratoRecursos, eq(t.contratoRecursos.contratoId, t.contratos.id))
    .innerJoin(t.alternativas, eq(t.alternativas.id, t.contratos.alternativaId))
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.clientes, eq(t.clientes.id, t.empresas.clienteId))
    .innerJoin(t.paises, eq(t.paises.id, t.empresas.paisId))
    .leftJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
    .where(
      and(
        eq(t.contratos.tipoPaquete, "CONSUMIBLE"),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        eq(t.contratos.noRenovar, false),
        inArray(t.contratoRecursos.recursoId, [...FAMILIA_DE_SALDO.keys()]),
        eq(t.empresas.activa, true),
        eq(t.clientes.activo, true),
        empresaId ? eq(t.empresas.id, empresaId) : undefined,
        sql`not exists (select 1 from ${t.contratos} r where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO')`,
      ),
    )
    .orderBy(asc(t.contratos.creadoEn));
}

type Candidato = Awaited<ReturnType<typeof candidatos>>[number];

/**
 * Renueva por saldo los paquetes consumibles (Mejora v2.1, 8.15): cuando a un
 * paquete con renovación automática le queda el porcentaje configurado de
 * saldo o menos, y sigue vivo un producto que lo usa, se genera el mismo
 * paquete con el precio de renovación vigente. Clientes directos: una orden
 * propia con el medio de la compra anterior (nunca por suscripción).
 * Agrupados por planilla: sin orden, la incorpora la orden colectiva.
 *
 * Lo llama el servicio de consumos después de cada pedido y el proceso
 * diario como control. Cada paquete se evalúa por su propio saldo.
 */
export async function renovarConsumibles(
  db: Db,
  hoy: Fecha = hoyArgentina(),
  empresaId?: string,
): Promise<ResumenConsumibles> {
  const resumen: ResumenConsumibles = { renovados: 0, omitidos: [] };
  const porcentaje = await leerParametroDe(db, "consumibles.porcentaje_renovacion");
  const lista = (await candidatos(db, empresaId)).filter((c) =>
    saldoParaRenovar(Number(c.saldo), c.cantidadRecurso, porcentaje),
  );
  const vivosDe = new Map<string, Set<string>>();
  const vistos = new Set<string>();
  for (const c of lista) {
    if (vistos.has(c.contrato.id)) continue;
    vistos.add(c.contrato.id);
    let vivos = vivosDe.get(c.empresa.id);
    if (!vivos) {
      const licencia = await licenciaDeEmpresa(db, c.empresa.id, hoy);
      vivos = new Set(licencia.productos.map((p) => p.productoId));
      vivosDe.set(c.empresa.id, vivos);
    }
    const familia = FAMILIA_DE_SALDO.get(c.recursoId);
    if (!familia || !familiaConProductoVivo(familia, vivos)) {
      resumen.omitidos.push({ contratoId: c.contrato.id, motivo: "PRODUCTO_NO_VIVO" });
      continue;
    }
    if (!c.alternativa.activa) {
      resumen.omitidos.push({ contratoId: c.contrato.id, motivo: "ALTERNATIVA_NO_DISPONIBLE" });
      continue;
    }
    try {
      const motivo = await renovar(db, c, hoy);
      if (motivo === null) resumen.renovados++;
      else resumen.omitidos.push({ contratoId: c.contrato.id, motivo });
    } catch (e) {
      resumen.omitidos.push({
        contratoId: c.contrato.id,
        motivo: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return resumen;
}

/** Genera la renovación de un consumible. Devuelve el motivo si no se pudo. */
async function renovar(db: Db, c: Candidato, hoy: Fecha): Promise<string | null> {
  return db.transaction(async (tx) => {
    // Otro pedido pudo haberlo renovado mientras tanto.
    await tx
      .select({ id: t.contratos.id })
      .from(t.contratos)
      .where(eq(t.contratos.id, c.contrato.id))
      .for("update");
    const yaRenovado = await tx.query.contratos.findFirst({
      columns: { id: true },
      where: and(
        eq(t.contratos.contratoAnteriorId, c.contrato.id),
        sql`${t.contratos.estado} <> 'CANCELADO'`,
      ),
    });
    if (yaRenovado) return "YA_RENOVADO";

    const grupo = c.cliente.grupoId
      ? await tx.query.gruposEconomicos.findFirst({
          where: eq(t.gruposEconomicos.id, c.cliente.grupoId),
        })
      : undefined;
    const clienteFacturacionGrupoId = grupo?.clienteFacturacionId ?? null;
    const facturarA = (m: typeof t.mediosPago.$inferSelect) =>
      resolverClienteFacturacion({
        clienteId: c.cliente.id,
        clienteFacturacionGrupoId,
        clienteFacturacionOficinaId: c.clienteFacturacionOficinaId,
        medio: m,
      });
    const medios = await tx.select().from(t.mediosPago).orderBy(asc(t.mediosPago.orden));
    const posibles = [
      ...new Set(medios.map(facturarA).concat(c.cliente.id, clienteFacturacionGrupoId ?? [])),
    ];
    const facturables = await tx
      .select({
        id: t.clientes.id,
        modo: t.clientes.modoFacturacion,
        emisorId: t.clientes.emisorId,
        condicionIva: t.clientes.condicionIva,
      })
      .from(t.clientes)
      .where(inArray(t.clientes.id, posibles));
    const emisores = await emisoresParaVenta(
      tx,
      facturables.flatMap((f) => (f.emisorId ? [f.emisorId] : [])),
      c.empresa.paisId,
    );
    const facturableDe = (m: typeof t.mediosPago.$inferSelect) =>
      facturables.find((f) => f.id === facturarA(m));
    const emisorCon = (m: typeof t.mediosPago.$inferSelect) => {
      const id = facturableDe(m)?.emisorId;
      return resolverEmisor(id ? emisores.porId.get(id) : undefined, emisores.preferido);
    };
    // Nunca por suscripción: el importe no es periódico (8.19).
    const usable = (m: typeof t.mediosPago.$inferSelect | undefined) => {
      if (!m || m.tipo === "SUSCRIPCION_MP") return false;
      if (!validarMedioPago(m, { paisId: c.empresa.paisId, instancia: "RENOVACION" }).ok) {
        return false;
      }
      const modo = facturableDe(m)?.modo ?? 0;
      const emisor = emisorCon(m);
      return (
        medioPermitidoParaModo(m.modosFacturacion, esModoFacturacion(modo) ? modo : 0) &&
        emisor.ok &&
        medioDisponibleParaEmisor(m.tipo, emisor.valor)
      );
    };
    // El medio de la compra anterior; si ya no sirve, el de renovación del cliente.
    const preferidos = [c.medioAnteriorId, c.cliente.medioPagoRenovacionId].map((id) =>
      medios.find((m) => m.id === id),
    );
    const medio = preferidos.find(usable) ?? medios.find(usable);
    if (!medio) return "SIN_MEDIO_DE_PAGO";
    const facturable = facturableDe(medio);
    const emisor = emisorCon(medio);
    if (!facturable || !emisor.ok) return "SIN_EMISOR";
    const modo = esModoFacturacion(facturable.modo) ? facturable.modo : 0;
    const fiscal = condicionParaFacturar(await condicionFiscal(tx, facturable.condicionIva));
    if (!fiscal.ok) return `IVA: ${fiscal.error}`;

    const anterior = c.contrato;
    const recurrente = anterior.bonifRecurrente;
    const calculo = calcularOrden({
      moneda: c.moneda,
      items: [
        {
          clave: anterior.id,
          paqueteId: anterior.paqueteId,
          tipoAccion: "RENOVACION",
          cantidad: anterior.cantidad,
          precioCompra: c.alternativa.precioCompra,
          precioRenovacion: c.alternativa.precioRenovacion,
          bonifPorcentaje: recurrente ? anterior.bonifPorcentaje : 0n,
          moneda: c.moneda,
        },
      ],
      ajustePagoPorcentaje: medio.ajustePorcentaje,
      alicuotaIva: fiscal.valor.alicuota,
    });
    if (!calculo.ok) return `CALCULO: ${calculo.error}`;
    const k = calculo.valor;
    const linea = k.items[0];
    if (!linea) return "CALCULO";

    // Agrupado por planilla: sin orden, la incorpora la colectiva (8.12).
    const agrupada = medio.planilla && clienteFacturacionGrupoId !== null;
    let orden: { id: string; numero: number } | undefined;
    if (!agrupada) {
      [orden] = await tx
        .insert(t.ordenes)
        .values({
          empresaId: c.empresa.id,
          clienteId: c.cliente.id,
          clienteFacturacionId: facturable.id,
          modoFacturacion: modo,
          emisorId: emisor.valor.id,
          emisorCuit: emisor.valor.cuit,
          emisorRazonSocial: emisor.valor.razonSocial,
          medioPagoId: medio.id,
          tipoGeneracion: "RENOVACION",
          ordenOrigenId: c.ordenOrigenId,
          moneda: c.moneda,
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
          claveIdempotencia: `consumible:${anterior.id}`,
        })
        .returning({ id: t.ordenes.id, numero: t.ordenes.numero });
      if (!orden) throw new Error("No se pudo crear la orden");
    }

    const estado = estadoInicial(modo);
    const habilitado = estado === "PEND_PAGO_ACTIVO";
    const tolerancia = (await leerParametroDe(tx, "facturacion.tolerancia_dias"))[modo];
    const [nuevo] = await tx
      .insert(t.contratos)
      .values({
        empresaId: anterior.empresaId,
        oficinaId: anterior.oficinaId,
        paqueteId: anterior.paqueteId,
        alternativaId: anterior.alternativaId,
        ordenId: orden?.id ?? null,
        contratoAnteriorId: anterior.id,
        tipoAccion: "RENOVACION",
        tipoPaquete: "CONSUMIBLE",
        cantidad: anterior.cantidad,
        meses: null,
        estado,
        pendPagoActivoHasta: habilitado ? plazoDeAlta(modo, tolerancia, hoy) : null,
        desde: habilitado ? hoy : null,
        hasta: null,
        precioLista: linea.precioLista,
        bonifPorcentaje: recurrente ? anterior.bonifPorcentaje : 0n,
        bonifRecurrente: recurrente,
        bonifMotivo: recurrente ? anterior.bonifMotivo : null,
        precioFinal: linea.precioFinal,
      })
      .returning({ id: t.contratos.id });
    if (!nuevo) throw new Error("No se pudo crear el contrato");

    const recursos = await tx
      .select({
        recursoId: t.paqueteRecursos.recursoId,
        cantidad: t.paqueteRecursos.cantidad,
        clase: t.recursos.clase,
        agregacion: t.recursos.agregacion,
      })
      .from(t.paqueteRecursos)
      .innerJoin(t.recursos, eq(t.recursos.id, t.paqueteRecursos.recursoId))
      .where(eq(t.paqueteRecursos.paqueteId, anterior.paqueteId));
    const suyos = recursos
      .filter((r) => r.cantidad > 0)
      .map((r) => ({
        contratoId: nuevo.id,
        recursoId: r.recursoId,
        clase: r.clase,
        cantidad: cantidadContratada(r.cantidad, anterior.cantidad, r.agregacion),
      }));
    if (suyos.length) await tx.insert(t.contratoRecursos).values(suyos);
    // Habilitado sin esperar el pago: el saldo se acredita ya (si no, al pagar).
    if (habilitado) {
      await cargarSaldos(tx, nuevo.id, suyos, 1, "Renovación por saldo");
      await registrarCambioEmpresa(tx, [anterior.empresaId]);
    }
    if (orden) {
      await tx.insert(t.ordenItems).values({
        ordenId: orden.id,
        contratoId: nuevo.id,
        descripcion: `${c.paquete} · renovación por saldo${anterior.cantidad > 1 ? ` ×${anterior.cantidad}` : ""}`,
        precioLista: linea.precioLista,
        bonificacion: linea.bonificacion,
        precioFinal: linea.precioFinal,
        totalProrrateado: linea.totalProrrateado,
      });
    }

    await auditar(tx, {
      ...ACTOR,
      entidad: "contrato",
      empresaId: anterior.empresaId,
      entidadId: nuevo.id,
      accion: "renovacion_consumible",
      despues: {
        anterior: anterior.id,
        orden: orden?.numero ?? null,
        total: k.total.toString(),
        agrupada,
      },
    });
    await registrarAlerta(tx, {
      tipo: "RENOVACION_CONSUMIBLE",
      clave: `RENOVACION_CONSUMIBLE:${nuevo.id}`,
      mensaje: orden
        ? `A ${c.paquete} le queda poco saldo: generamos la orden #${orden.numero} por ${formatearMoneda(k.total as Centavos)} para renovarlo.`
        : `A ${c.paquete} le queda poco saldo: lo renovamos y se cobra en la próxima factura del grupo.`,
      empresaId: anterior.empresaId,
      contratoId: nuevo.id,
      ordenId: orden?.id ?? null,
      paraSofteam: false,
    });
    // Sin importe (bonificación recurrente del 100 %): queda pagada.
    if (orden && k.total === 0n) {
      await registrarPago(tx, orden.id, null, hoy, { actorTipo: ACTOR.actorTipo });
    }
    return null;
  });
}
