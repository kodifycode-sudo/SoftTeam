import type { Fecha } from "@/domain/fecha";
import { esDiaDeRecordatorio, ventanasDeRenovacion } from "@/domain/procesos/calendario";
import type { Db } from "@/server/db/cliente";
import type { FuenteFacturador } from "../cobros/facturacion";
import { facturarPendientes } from "../cobros/facturacion";
import { leerParametroDe } from "../parametros";
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
  opciones: { forzar?: boolean; facturador?: FuenteFacturador | null } = {},
): Promise<ResumenProcesos> {
  const diasCorte = await leerParametroDe(db, "renovacion.dias_corte");
  const diasRecordatorio = await leerParametroDe(db, "cobranza.recordatorios_dias");

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
