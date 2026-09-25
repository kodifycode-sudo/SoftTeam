"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/formulario";
import { type ContextoCliente, requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";
import { agregarAlCarrito, cambiarCantidad } from "@/server/modules/ventas/carrito";
import { confirmarOrden } from "@/server/modules/ventas/checkout";
import { mensajeRechazoCompra } from "./mensajes";

const puedeComprar = (c: ContextoCliente) => c.adminGeneral || c.adminComercial;

export async function agregarAlCarritoAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirCliente();
  if (!puedeComprar(contexto)) return { mensaje: "Tu usuario no puede contratar paquetes." };
  const datos = z
    .object({ alternativaId: z.uuid(), cantidad: z.coerce.number().int().min(1).max(99) })
    .safeParse({
      alternativaId: formData.get("alternativaId"),
      cantidad: formData.get("cantidad"),
    });
  if (!datos.success) return { mensaje: "Cantidad inválida." };

  const db = await obtenerDb();
  const resultado = await agregarAlCarrito(db, {
    empresaId: contexto.empresaId,
    usuarioId: contexto.usuarioId,
    ...datos.data,
  });
  if (!resultado.ok) {
    return {
      mensaje:
        resultado.error === "NO_DISPONIBLE"
          ? "Ese paquete ya no está disponible."
          : "Cantidad inválida.",
    };
  }
  revalidatePath("/portal", "layout");
  return { ok: true, mensaje: "Agregado al carrito." };
}

export async function cambiarCantidadAccion(formData: FormData): Promise<void> {
  const contexto = await requerirCliente();
  if (!puedeComprar(contexto)) return;
  const datos = z
    .object({ itemId: z.uuid(), cantidad: z.coerce.number().int().min(0).max(99) })
    .safeParse({ itemId: formData.get("itemId"), cantidad: formData.get("cantidad") });
  if (!datos.success) return;
  const db = await obtenerDb();
  await cambiarCantidad(db, { empresaId: contexto.empresaId, ...datos.data });
  revalidatePath("/portal", "layout");
}

export async function confirmarOrdenAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const contexto = await requerirCliente();
  if (!puedeComprar(contexto)) return { mensaje: "Tu usuario no puede contratar paquetes." };
  const datos = z
    .object({
      medioPagoId: z.uuid(),
      ticketCodigo: z.string().trim().max(20).optional(),
      claveIdempotencia: z.uuid(),
      acepta: z.literal("on", { error: "Confirmá que revisaste la orden" }),
    })
    .safeParse({
      medioPagoId: formData.get("medioPagoId"),
      ticketCodigo: formData.get("ticketCodigo") || undefined,
      claveIdempotencia: formData.get("claveIdempotencia"),
      acepta: formData.get("acepta"),
    });
  if (!datos.success) {
    return { mensaje: datos.error.issues[0]?.message ?? "Revisá los datos de la orden." };
  }

  const db = await obtenerDb();
  const resultado = await confirmarOrden(db, {
    empresaId: contexto.empresaId,
    usuarioId: contexto.usuarioId,
    medioPagoId: datos.data.medioPagoId,
    ticketCodigo: datos.data.ticketCodigo,
    claveIdempotencia: datos.data.claveIdempotencia,
  });
  if (!resultado.ok) return { mensaje: mensajeRechazoCompra(resultado.error, resultado.detalle) };

  programarEntregaDeEventos();
  revalidatePath("/portal", "layout");
  redirect(`/portal/ordenes/${resultado.valor.ordenId}?nueva=1`);
}
