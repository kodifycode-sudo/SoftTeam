"use server";

import { redirect } from "next/navigation";
import { anidar, type EstadoFormulario, erroresPorRuta, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { altaClientePorSofteam, esquemaAltaCliente } from "@/server/modules/cuentas/altas-softeam";
import { enviarInvitacion } from "@/server/modules/cuentas/invitaciones";

/** Alta de cliente por SOFTeam (Administración o Comercial). */
export async function altaClienteAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const valores = valoresDe(formData);
  const datos = esquemaAltaCliente.safeParse({
    ...anidar(valores),
    emisorId: valores.emisorId || undefined,
  });
  if (!datos.success) {
    return { errores: erroresPorRuta(datos.error), mensaje: "Revisá los datos marcados.", valores };
  }
  const resultado = await altaClientePorSofteam(await obtenerDb(), datos.data, user.id);
  if (!resultado.ok) {
    if (resultado.error === "CUIT_DUPLICADO") {
      return {
        errores: {
          cuit: ["Ya existe un cliente con ese CUIT: agregale una empresa desde su ficha."],
        },
        valores,
      };
    }
    if (resultado.error === "PROVINCIA_INVALIDA") {
      return {
        errores: { "domicilioFiscal.provincia": ["Elegí una provincia de la lista."] },
        valores,
      };
    }
    if (resultado.error === "CONDICION_IVA_INVALIDA") {
      return {
        errores: { condicionIva: ["Elegí una condición frente al IVA de la lista."] },
        valores,
      };
    }
    return {
      errores: { "administrador.email": ["Ese mail es de un usuario de SOFTeam."] },
      valores,
    };
  }
  if (valores.invitar === "on") {
    await enviarInvitacion(resultado.usuario, `la cuenta de ${datos.data.nombre}`);
  }
  redirect(`/admin/clientes/${resultado.clienteId}?aviso=creado`);
}
