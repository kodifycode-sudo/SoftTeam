"use server";

import { revalidatePath } from "next/cache";
import { claveMaestra } from "@/env";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { type ErrorEmisor, esquemaEmisor, guardarEmisor } from "@/server/modules/catalogo/emisores";

const MENSAJES: Record<ErrorEmisor, EstadoFormulario> = {
  NO_EXISTE: { mensaje: "El emisor ya no existe." },
  CUIT_DUPLICADO: { errores: { cuit: ["Ya hay un emisor con ese CUIT."] } },
  CONDICION_INVALIDA: {
    errores: { condicionIva: ["El emisor tiene que ser Responsable Inscripto (emite A y B)."] },
  },
};

/** Alta o edición de un emisor (solo Administración). Los secretos vacíos se conservan. */
export async function guardarEmisorAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const marcado = (campo: string) => valores[campo] === "on";
  const datos = esquemaEmisor.safeParse({
    ...valores,
    id: valores.id || undefined,
    puntoVenta: valores.puntoVenta || undefined,
    xubioPuntoVentaId: valores.xubioPuntoVentaId || undefined,
    xubioProductoId: valores.xubioProductoId || undefined,
    xubioCentroCostoId: valores.xubioCentroCostoId || undefined,
    preferido: marcado("preferido"),
    activo: marcado("activo"),
    xubio: marcado("xubio"),
    mercadoPago: marcado("mercadoPago"),
  });
  // Los secretos no vuelven al formulario.
  const { xubioSecreto: _x, mpAccessToken: _m, mpSecretoAvisos: _s, ...visibles } = valores;
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores: visibles };
  const r = await guardarEmisor(await obtenerDb(), datos.data, user.id, claveMaestra);
  if (!r.ok) return { ...MENSAJES[r.error], valores: visibles };
  revalidatePath("/admin/emisores");
  return { ok: true, mensaje: `Guardamos ${datos.data.razonSocial}.` };
}
