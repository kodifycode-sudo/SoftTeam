"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { anularAltaAGrupo } from "@/server/modules/ventas/tablero";

/** Anula un alta a grupo que todavía no entró en una orden colectiva (solo Administración). */
export async function anularAltaAGrupoAccion(formData: FormData): Promise<void> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const contratoId = z.uuid().safeParse(formData.get("contratoId"));
  if (!contratoId.success) return;
  await anularAltaAGrupo(await obtenerDb(), contratoId.data, user.id);
  revalidatePath("/admin/pendientes");
  revalidatePath("/admin");
}
