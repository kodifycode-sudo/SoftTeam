"use server";

import { revalidatePath } from "next/cache";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { crearOficina, esquemaOficina } from "@/server/modules/cuentas/oficinas";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

export async function crearOficinaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirCliente();
  if (!contexto.adminGeneral && !contexto.adminOperativo) {
    return { mensaje: "No tenés permiso para configurar oficinas." };
  }
  const valores = valoresDe(formData);
  const nuevoCanal = valores.canalId === "nuevo";
  const datos = esquemaOficina.safeParse({
    nombre: valores.nombre,
    telefono: valores.telefono || undefined,
    domicilio: valores.domicilio || undefined,
    canalId: nuevoCanal ? undefined : valores.canalId || undefined,
    canalNuevo: nuevoCanal ? valores.canalNuevo : undefined,
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  if (nuevoCanal && !datos.data.canalNuevo) {
    return { errores: { canalNuevo: ["Ingresá el nombre del canal"] }, valores };
  }

  const db = await obtenerDb();
  const resultado = await crearOficina(db, contexto.empresaId, datos.data, contexto.usuarioId);
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error === "CANAL_INVALIDO"
          ? "El canal elegido no es válido."
          : "No quedan códigos disponibles en ese canal.",
      valores,
    };
  }
  programarEntregaDeEventos();
  revalidatePath("/portal/oficinas");
  return { ok: true, mensaje: `Oficina ${resultado.codigo} creada.` };
}
