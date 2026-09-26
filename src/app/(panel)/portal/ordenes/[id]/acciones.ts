"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requerirComercial } from "@/server/auth/sesion";
import { obtenerPasarela, urlBase } from "@/server/cobros";
import { obtenerDb } from "@/server/db";
import { obtenerLinkDePago } from "@/server/modules/cobros/pagos";

/** Lleva al cliente a pagar la orden (Mercado Pago o, en desarrollo, el simulador). */
export async function pagarOrdenAccion(formData: FormData): Promise<void> {
  const contexto = await requerirComercial();
  const id = z.uuid().safeParse(formData.get("ordenId"));
  if (!id.success) redirect("/portal/ordenes");
  const link = await obtenerLinkDePago(await obtenerDb(), obtenerPasarela(), id.data, {
    urlBase,
    alcance: { empresaId: contexto.empresaId, clienteId: contexto.clienteId },
  });
  if (!link.ok) redirect(`/portal/ordenes/${id.data}?pago=no-disponible`);
  redirect(link.url);
}
