import { and, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { excedeLicencia, PRODUCTOS_CON_ACCESO, TIPOS_INTERFAZ } from "@/domain/cuentas/limites";
import { diasEntre, type Fecha, sumarDias } from "@/domain/fecha";
import { avisoDeVencimiento, estadoDeSaldo } from "@/domain/procesos/calendario";
import { fechaCorta } from "@/lib/formato";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { NOMBRE_PRODUCTO, usoDeLimites } from "../configuracion/limites";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { licenciaDeEmpresa } from "../licencias/licencia-empresa";
import { leerParametroDe } from "../parametros";
import { registrarAlerta } from "./alertas";

const ACTOR = { actorId: null, actorTipo: "job:diario" } as const;

/** Días de gracia para recuperar alertas de vencidos si el proceso no corrió. */
const DIAS_RECUPERO = 7;
/** Anticipación del aviso de fin de la excepción de pago. */
const DIAS_AVISO_PLAZO_PAGO = 3;

export interface ResumenDiario {
  excepcionesVencidas: number;
  alertas: Record<string, number>;
}

/**
 * Proceso diario (idempotente: correrlo dos veces el mismo día no cambia
 * nada ni duplica alertas).
 * 1. Vence las excepciones de pago cuyo plazo terminó.
 * 2. Genera las alertas del día.
 */
export async function procesoDiario(db: Db, hoy: Fecha): Promise<ResumenDiario> {
  const excepcionesVencidas = await vencerExcepciones(db, hoy);
  const alertas: Record<string, number> = {};
  const contar = (tipo: string, creada: boolean) => {
    if (creada) alertas[tipo] = (alertas[tipo] ?? 0) + 1;
  };

  const umbrales = await leerParametroDe(db, "alertas.vencimiento_dias");
  const porcentajeBajo = await leerParametroDe(db, "alertas.saldo_bajo_porcentaje");

  await alertasDeVencimiento(db, hoy, umbrales, contar);
  await alertasDePlazoDePago(db, hoy, contar);
  await alertasDeSaldo(db, porcentajeBajo, contar);
  await alertasDeEmpresa(db, hoy, contar);
  return { excepcionesVencidas, alertas };
}

/** PEND_PAGO_ACTIVO con plazo vencido → PEND_PAGO: deja de sumar a la licencia. */
async function vencerExcepciones(db: Db, hoy: Fecha): Promise<number> {
  return db.transaction(async (tx) => {
    const vencidos = await tx
      .update(t.contratos)
      .set({ estado: "PEND_PAGO" })
      .where(
        and(
          eq(t.contratos.estado, "PEND_PAGO_ACTIVO"),
          isNotNull(t.contratos.pendPagoActivoHasta),
          lt(t.contratos.pendPagoActivoHasta, hoy),
        ),
      )
      .returning({
        id: t.contratos.id,
        empresaId: t.contratos.empresaId,
        hasta: t.contratos.pendPagoActivoHasta,
      });
    if (vencidos.length === 0) return 0;
    await registrarCambioEmpresa(tx, [...new Set(vencidos.map((v) => v.empresaId))]);
    for (const v of vencidos) {
      await auditar(tx, {
        ...ACTOR,
        entidad: "contrato",
        empresaId: v.empresaId,
        entidadId: v.id,
        accion: "vencer_excepcion",
        antes: { estado: "PEND_PAGO_ACTIVO", pendPagoActivoHasta: v.hasta },
        despues: { estado: "PEND_PAGO" },
      });
    }
    return vencidos.length;
  });
}

type Contar = (tipo: string, creada: boolean) => void;

/** Contratos que ya tienen una renovación generada (no cancelada). */
const tieneRenovacion = sql<boolean>`exists (select 1 from ${t.contratos} r where r.contrato_anterior_id = ${t.contratos.id} and r.estado <> 'CANCELADO')`;
/** Renovación ya habilitada (pagada o con excepción de pago). */
const renovacionHabilitada = sql<boolean>`exists (select 1 from ${t.contratos} r where r.contrato_anterior_id = ${t.contratos.id} and r.estado in ('ACTIVO', 'PEND_PAGO_ACTIVO'))`;

async function alertasDeVencimiento(
  db: Db,
  hoy: Fecha,
  umbrales: [number, number, number],
  contar: Contar,
) {
  const maximo = Math.max(...umbrales);
  const contratos = await db
    .select({
      id: t.contratos.id,
      empresaId: t.contratos.empresaId,
      hasta: t.contratos.hasta,
      paquete: t.paquetes.nombre,
      renovado: tieneRenovacion,
      renovacionHabilitada,
    })
    .from(t.contratos)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.contratos.paqueteId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .where(
      and(
        eq(t.empresas.activa, true),
        eq(t.contratos.tipoPaquete, "TEMPORAL"),
        eq(t.contratos.noRenovar, false),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
        gte(t.contratos.hasta, sumarDias(hoy, -DIAS_RECUPERO)),
        lte(t.contratos.hasta, sumarDias(hoy, maximo)),
      ),
    );

  for (const c of contratos) {
    if (!c.hasta) continue;
    const restantes = diasEntre(hoy, c.hasta);
    if (restantes >= 0) {
      // Con la renovación ya generada, el aviso es la propia orden.
      if (c.renovado) continue;
      const tipo = avisoDeVencimiento(restantes, umbrales);
      if (!tipo) continue;
      contar(
        tipo,
        await registrarAlerta(db, {
          tipo,
          clave: `${tipo}:${c.id}:${c.hasta}`,
          mensaje:
            restantes === 0
              ? `${c.paquete} vence hoy. Renovalo para no perder el servicio.`
              : `${c.paquete} vence el ${fechaCorta(c.hasta)} (en ${restantes} día${restantes === 1 ? "" : "s"}). Renovalo para no perder el servicio.`,
          empresaId: c.empresaId,
          contratoId: c.id,
          paraSofteam: false,
        }),
      );
    } else if (!c.renovacionHabilitada) {
      contar(
        "LICENCIA_VENCIDA",
        await registrarAlerta(db, {
          tipo: "LICENCIA_VENCIDA",
          clave: `LICENCIA_VENCIDA:${c.id}`,
          mensaje: c.renovado
            ? `${c.paquete} venció el ${fechaCorta(c.hasta)}. Pagá la orden de renovación para reactivarlo.`
            : `${c.paquete} venció el ${fechaCorta(c.hasta)}.`,
          empresaId: c.empresaId,
          contratoId: c.id,
        }),
      );
    }
  }
}

async function alertasDePlazoDePago(db: Db, hoy: Fecha, contar: Contar) {
  const ordenes = await db
    .selectDistinct({
      ordenId: t.ordenes.id,
      numero: t.ordenes.numero,
      empresaId: t.contratos.empresaId,
      limite: t.contratos.pendPagoActivoHasta,
    })
    .from(t.contratos)
    .innerJoin(t.ordenes, eq(t.ordenes.id, t.contratos.ordenId))
    .where(
      and(
        eq(t.contratos.estado, "PEND_PAGO_ACTIVO"),
        eq(t.ordenes.estado, "PEND_PAGO"),
        gte(t.contratos.pendPagoActivoHasta, hoy),
        lte(t.contratos.pendPagoActivoHasta, sumarDias(hoy, DIAS_AVISO_PLAZO_PAGO)),
      ),
    );
  for (const o of ordenes) {
    contar(
      "PLAZO_PAGO_POR_VENCER",
      await registrarAlerta(db, {
        tipo: "PLAZO_PAGO_POR_VENCER",
        clave: `PLAZO_PAGO_POR_VENCER:${o.ordenId}:${o.limite}`,
        mensaje: `El servicio de la orden #${o.numero} sigue habilitado hasta el ${fechaCorta(o.limite)}. Pagala antes para no perderlo.`,
        empresaId: o.empresaId,
        ordenId: o.ordenId,
      }),
    );
  }
}

/**
 * Saldo prepago bajo o agotado, por empresa y recurso. Se mide sobre los
 * contratos que todavía tienen saldo; la clave incluye lo cargado en total,
 * así una compra nueva vuelve a habilitar los avisos.
 */
async function alertasDeSaldo(db: Db, porcentajeBajo: number, contar: Contar) {
  const filas = await db
    .select({
      empresaId: t.contratos.empresaId,
      contratoId: t.contratos.id,
      recursoId: t.movimientosSaldo.recursoId,
      recurso: t.recursos.nombre,
      producto: t.productos.nombre,
      cargado: sql<number>`coalesce(sum(${t.movimientosSaldo.creditos}) filter (where ${t.movimientosSaldo.tipo} = 'CARGA'), 0)::int`,
      saldo: sql<number>`coalesce(sum(${t.movimientosSaldo.creditos}), 0)::int`,
    })
    .from(t.movimientosSaldo)
    .innerJoin(t.contratos, eq(t.contratos.id, t.movimientosSaldo.contratoId))
    .innerJoin(t.empresas, eq(t.empresas.id, t.contratos.empresaId))
    .innerJoin(t.recursos, eq(t.recursos.id, t.movimientosSaldo.recursoId))
    .innerJoin(t.productos, eq(t.productos.id, t.recursos.productoId))
    .where(
      and(
        eq(t.movimientosSaldo.clase, "SALDO"),
        eq(t.empresas.activa, true),
        inArray(t.contratos.estado, ["ACTIVO", "PEND_PAGO_ACTIVO"]),
      ),
    )
    .groupBy(
      t.contratos.empresaId,
      t.contratos.id,
      t.movimientosSaldo.recursoId,
      t.recursos.nombre,
      t.productos.nombre,
    );

  const grupos = new Map<string, typeof filas>();
  for (const f of filas) {
    const clave = `${f.empresaId}|${f.recursoId}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  for (const contratos of grupos.values()) {
    const primero = contratos[0];
    if (!primero) continue;
    const historico = contratos.reduce((s, c) => s + Number(c.cargado), 0);
    const conSaldo = contratos.filter((c) => Number(c.saldo) > 0);
    const total = conSaldo.reduce((s, c) => s + Number(c.cargado), 0);
    const disponible = conSaldo.reduce((s, c) => s + Number(c.saldo), 0);
    const estado =
      conSaldo.length === 0 ? "AGOTADO" : estadoDeSaldo(total, disponible, porcentajeBajo);
    if (estado === "NORMAL") continue;
    const nombre = `${primero.producto} (${primero.recurso.toLowerCase()})`;
    const tipo = estado === "AGOTADO" ? "SALDO_AGOTADO" : "SALDO_BAJO";
    contar(
      tipo,
      await registrarAlerta(db, {
        tipo,
        clave: `${tipo}:${primero.empresaId}:${primero.recursoId}:${historico}`,
        mensaje:
          estado === "AGOTADO"
            ? `Se agotó el saldo de ${nombre}. Cargá un paquete para seguir usándolo.`
            : `Te quedan ${disponible.toLocaleString("es-AR")} créditos de ${nombre} (${Math.round((disponible * 100) / total)} %).`,
        empresaId: primero.empresaId,
      }),
    );
  }
}

/**
 * Por empresa activa: sin ningún paquete vigente (una vez por mes), y usuarios
 * o interfaces por encima de lo licenciado (la licencia bajó después de
 * activarlos: no se desactiva nada solo, se avisa).
 */
async function alertasDeEmpresa(db: Db, hoy: Fecha, contar: Contar) {
  const mes = hoy.slice(0, 7);
  const empresas = await db
    .select({ id: t.empresas.id, nombre: t.empresas.nombre })
    .from(t.empresas)
    .where(eq(t.empresas.activa, true));

  for (const empresa of empresas) {
    const licencia = await licenciaDeEmpresa(db, empresa.id, hoy);
    if (licencia.productos.length === 0) {
      contar(
        "EMPRESA_SIN_PAQUETE",
        await registrarAlerta(db, {
          tipo: "EMPRESA_SIN_PAQUETE",
          clave: `EMPRESA_SIN_PAQUETE:${empresa.id}:${mes}`,
          mensaje: `${empresa.nombre} no tiene paquetes vigentes. Elegí los que necesitás desde Paquetes disponibles.`,
          empresaId: empresa.id,
        }),
      );
      continue;
    }

    const excesos = excesosDeLimites(await usoDeLimites(db, empresa.id, hoy));
    if (excesos.length > 0) {
      const textos = excesos.map((e) => e.texto);
      contar(
        "LIMITE_EXCEDIDO",
        await registrarAlerta(db, {
          tipo: "LIMITE_EXCEDIDO",
          clave: `LIMITE_EXCEDIDO:${empresa.id}:${mes}:${textos.join("|")}`,
          mensaje: `Tenés más de lo licenciado (${textos.join("; ")}). Dá de baja lo que sobra o sumá un paquete.`,
          empresaId: empresa.id,
        }),
      );
    }

    await alertaDeLicenciaPorBajar(
      db,
      empresa.id,
      hoy,
      licencia.contratosVigentes,
      excesos,
      contar,
    );
  }
}

/** Usuarios o interfaces por encima de lo licenciado, con una clave estable para compararlos. */
function excesosDeLimites(uso: Awaited<ReturnType<typeof usoDeLimites>>) {
  return [
    ...PRODUCTOS_CON_ACCESO.filter((p) => excedeLicencia(uso.usuarios[p])).map((p) => ({
      clave: `usuarios:${p}`,
      texto: `usuarios de ${NOMBRE_PRODUCTO[p]}: ${uso.usuarios[p].enUso} activos de ${uso.usuarios[p].licenciados ?? 0}`,
    })),
    ...TIPOS_INTERFAZ.filter((i) => excedeLicencia(uso.interfaces[i])).map((i) => ({
      clave: `interfaces:${i}`,
      texto: `interfaces de ${i === "prodigal" ? "Prodigal" : "CotiWeb"}: ${uso.interfaces[i].enUso} activas de ${uso.interfaces[i].licenciados ?? 0}`,
    })),
  ];
}

/** Anticipación del aviso de que la licencia va a quedar por debajo de lo configurado. */
const DIAS_AVISO_LICENCIA = 15;

/**
 * Aviso anticipado: si al vencer un paquete en los próximos días (y no
 * renovarse, o no pagarse la renovación) la empresa queda con más usuarios o
 * interfaces de los licenciados, se avisa antes, para que renueve o elija qué
 * dar de baja a tiempo. Se calcula la licencia del día siguiente a cada
 * vencimiento, con las renovaciones ya vigentes para esa fecha. Un aviso por
 * vencimiento y por combinación de excesos.
 */
async function alertaDeLicenciaPorBajar(
  db: Db,
  empresaId: string,
  hoy: Fecha,
  vigentes: { paquete: string; hasta: Fecha | null }[],
  excesosDeHoy: { clave: string }[],
  contar: Contar,
) {
  const limite = sumarDias(hoy, DIAS_AVISO_LICENCIA);
  const vencimientos = [
    ...new Set(
      vigentes.flatMap((c) => (c.hasta && c.hasta >= hoy && c.hasta <= limite ? [c.hasta] : [])),
    ),
  ].sort();
  const yaExcedidos = new Set(excesosDeHoy.map((e) => e.clave));

  for (const vence of vencimientos) {
    const despues = sumarDias(vence, 1);
    const nuevos = excesosDeLimites(await usoDeLimites(db, empresaId, despues)).filter(
      (e) => !yaExcedidos.has(e.clave),
    );
    if (nuevos.length === 0) continue;
    const paquetes = vigentes.filter((c) => c.hasta === vence).map((c) => c.paquete);
    contar(
      "LICENCIA_POR_BAJAR",
      await registrarAlerta(db, {
        tipo: "LICENCIA_POR_BAJAR",
        clave: `LICENCIA_POR_BAJAR:${empresaId}:${vence}:${nuevos.map((e) => e.clave).join("|")}`,
        mensaje: `El ${fechaCorta(vence)} vence ${paquetes.join(", ")}. Si no se renueva, vas a tener más de lo licenciado (${nuevos.map((e) => e.texto).join("; ")}). Renovalo o elegí qué dar de baja antes de esa fecha.`,
        empresaId,
      }),
    );
    // El primer vencimiento que deja de más alcanza: los siguientes lo repetirían.
    return;
  }
}
