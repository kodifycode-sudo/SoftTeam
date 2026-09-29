"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { enviarInvitacion } from "@/server/modules/cuentas/invitaciones";
import { DEFINICIONES, type TipoImportacion } from "@/server/modules/importacion/definiciones";
import { importar, type ResultadoImportacion } from "@/server/modules/importacion/importar";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

export interface EstadoImportacion {
  mensaje?: string;
  resultado?: Omit<ResultadoImportacion, "invitaciones" | "empresas"> & {
    invitacionesEnviadas: number;
  };
}

const TIPOS = Object.keys(DEFINICIONES) as [TipoImportacion, ...TipoImportacion[]];

/**
 * Revisa o importa un archivo (Administración). "Revisar" no guarda nada;
 * "Importar" guarda solo si ninguna fila tiene errores.
 */
export async function importarAccion(
  _: EstadoImportacion,
  formData: FormData,
): Promise<EstadoImportacion> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const datos = z
    .object({ tipo: z.enum(TIPOS), modo: z.enum(["revisar", "importar"]) })
    .safeParse({ tipo: formData.get("tipo"), modo: formData.get("modo") });
  const archivo = formData.get("archivo");
  if (!datos.success) return { mensaje: "Elegí qué vas a importar." };
  if (!(archivo instanceof File) || archivo.size === 0) return { mensaje: "Elegí el archivo." };

  const resultado = await importar(
    await obtenerDb(),
    datos.data.tipo,
    new Uint8Array(await archivo.arrayBuffer()),
    { confirmar: datos.data.modo === "importar" },
    user.id,
  );

  // El mail de acceso a los administradores nuevos, solo si se pidió.
  let invitacionesEnviadas = 0;
  if (resultado.confirmado) {
    if (formData.get("invitar") === "on") {
      const unicos = new Map(resultado.invitaciones.map((u) => [u.email, u]));
      for (const usuario of unicos.values()) {
        await enviarInvitacion(usuario, "la cuenta de tu empresa");
        invitacionesEnviadas++;
      }
    }
    programarEntregaDeEventos();
    revalidatePath("/admin", "layout");
  }
  const { invitaciones: _i, empresas: _e, ...resto } = resultado;
  return { resultado: { ...resto, invitacionesEnviadas } };
}
