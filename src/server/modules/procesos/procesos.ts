import { z } from "zod";
import type { Fecha } from "@/domain/fecha";
import { esDiaDeRecordatorio, ventanasDeRenovacion } from "@/domain/procesos/calendario";
import type { Facturador } from "@/server/cobros/facturador";
import type { Db } from "@/server/db/cliente";
import { facturarPendientes } from "../cobros/facturacion";
import { leerParametro } from "../parametros";
import { type EnviarAlerta, enviarAlertasPendientes } from "./alertas";
import { procesoDiario } from "./diario";
import { ejecutarJob, type ResultadoJob } from "./jobs";
import { procesoRecordatorios } from "./recordatorios";
import { procesoRenovacion, type ResumenRenovacion } from "./renovacion";

export interface ResumenProcesos {
  fecha: Fecha;
  renovacion: ResultadoJob<ResumenRenovacion[]>;
  diario: ResultadoJob<unknown>;
  recordatorios: ResultadoJob<unknown> | "NO_CORRESPONDE";
  envio: { enviadas: number; errores: number };
  facturacion: { emitidas: number; errores: number } | "SIN_FACTURADOR";
}

/**
 * Corre los procesos programados del día, en orden:
 * 1. Renovación (antes que las alertas: un contrato ya renovado no genera
 *    aviso de vencimiento).
 * 2. Diario: excepciones de pago y alertas.
 * 3. Recordatorios de cobro, si hoy es día de recordatorio.
 * 4. Envío por mail de las alertas pendientes.
 * 5. Facturas pendientes de emitir.
 *
 * Cada trabajo corre una vez por día; correr esto varias veces es seguro.
 */
export async function correrProcesos(
  db: Db,
  hoy: Fecha,
  enviar: EnviarAlerta,
  opciones: { forzar?: boolean; facturador?: Facturador | null } = {},
): Promise<ResumenProcesos> {
  const diasCorte = await leerParametro(
    db,
    "renovacion.dias_corte",
    z.tuple([z.int().min(1).max(28), z.int().min(1).max(28)]),
    [5, 15] as [number, number],
  );
  const diasRecordatorio = await leerParametro(
    db,
    "cobranza.recordatorios_dias",
    z.array(z.int().min(1).max(31)),
    [10, 20, 28],
  );

  const renovacion = await ejecutarJob(
    db,
    "renovacion",
    hoy,
    async () => {
      const resumenes: ResumenRenovacion[] = [];
      for (const ventana of ventanasDeRenovacion(hoy, diasCorte)) {
        resumenes.push(await procesoRenovacion(db, ventana));
      }
      const errores = resumenes.flatMap((r) => r.errores);
      // Si algún grupo falló, la corrida queda con error para reintentarla
      // (lo ya generado no se duplica).
      if (errores.length > 0) {
        throw new Error(`Renovación con errores: ${errores.map((e) => e.error).join("; ")}`);
      }
      return resumenes;
    },
    opciones,
  );
  const diario = await ejecutarJob(db, "diario", hoy, () => procesoDiario(db, hoy), opciones);
  const recordatorios = esDiaDeRecordatorio(hoy, diasRecordatorio)
    ? await ejecutarJob(db, "recordatorios", hoy, () => procesoRecordatorios(db, hoy), opciones)
    : ("NO_CORRESPONDE" as const);
  const envio = await enviarAlertasPendientes(db, enviar);
  // Órdenes pagadas cuya factura no se pudo emitir en el momento.
  const facturacion = opciones.facturador
    ? await facturarPendientes(db, opciones.facturador)
    : ("SIN_FACTURADOR" as const);
  return { fecha: hoy, renovacion, diario, recordatorios, envio, facturacion };
}
