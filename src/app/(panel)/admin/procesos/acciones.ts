"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hoy } from "@/domain/fecha";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerFacturador } from "@/server/cobros";
import { obtenerDb } from "@/server/db";
import { auditar } from "@/server/modules/auditoria";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";
import { descartarAlerta } from "@/server/modules/procesos/alertas";
import { enviarAlertaPorMail } from "@/server/modules/procesos/mail";
import { correrProcesos } from "@/server/modules/procesos/procesos";

const ESTADOS = {
  OK: "listo",
  YA_CORRIO: "ya había corrido hoy",
  EN_CURSO: "en curso en otra ejecución",
  ERROR: "con error",
} as const;

/**
 * Corre (o vuelve a correr) los procesos del día a pedido. Es seguro: cada
 * proceso es idempotente, así que reprocesar no duplica órdenes ni alertas.
 */
export async function ejecutarProcesosAccion(): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const db = await obtenerDb();
  const fecha = hoy();
  const r = await correrProcesos(db, fecha, enviarAlertaPorMail, {
    forzar: true,
    facturador: obtenerFacturador(),
  });
  await auditar(db, {
    actorId: user.id,
    entidad: "proceso",
    entidadId: fecha,
    accion: "ejecutar",
    despues: {
      renovacion: r.renovacion.estado,
      diario: r.diario.estado,
      recordatorios:
        r.recordatorios === "NO_CORRESPONDE" ? r.recordatorios : r.recordatorios.estado,
      envio: r.envio,
    },
  });
  programarEntregaDeEventos();
  revalidatePath("/admin/procesos");
  const error = [r.renovacion, r.diario].some((x) => x.estado === "ERROR");
  return {
    ok: !error,
    mensaje: `Renovación ${ESTADOS[r.renovacion.estado]}, diario ${ESTADOS[r.diario.estado]}. Avisos enviados: ${r.envio.enviadas}${r.envio.errores ? `, con error: ${r.envio.errores}` : ""}.`,
  };
}

export async function descartarAlertaAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(["ADMINISTRACION", "SOPORTE"]);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const db = await obtenerDb();
  await descartarAlerta(db, id.data);
  await auditar(db, {
    actorId: user.id,
    entidad: "alerta",
    entidadId: id.data,
    accion: "descartar",
  });
  revalidatePath("/admin/procesos");
}
