"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { guardarNotas } from "@/server/modules/cuentas/actividad";

export async function guardarNotasAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam();
  const datos = z
    .object({
      empresaId: z.uuid(),
      clienteId: z.uuid(),
      notas: z.string().max(5000, { error: "Hasta 5.000 caracteres" }),
    })
    .safeParse(Object.fromEntries(formData));
  if (!datos.success) return { mensaje: datos.error.issues[0]?.message ?? "Datos inválidos." };
  await guardarNotas(await obtenerDb(), datos.data.empresaId, datos.data.notas, user.id);
  revalidatePath(`/admin/clientes/${datos.data.clienteId}`);
  return { ok: true, mensaje: "Notas guardadas." };
}
