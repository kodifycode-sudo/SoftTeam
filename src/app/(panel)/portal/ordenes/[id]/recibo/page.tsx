import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VistaRecibo } from "@/components/compra/recibo";
import { requerirComercial } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerRecibo } from "@/server/modules/ventas/recibo";

export const metadata: Metadata = { title: "Recibo provisorio" };

export default async function ReciboPortal({ params }: PageProps<"/portal/ordenes/[id]/recibo">) {
  const contexto = await requerirComercial();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const recibo = await obtenerRecibo(await obtenerDb(), id, {
    empresaId: contexto.empresaId,
    clienteId: contexto.clienteId,
    alcance: contexto.alcance,
  });
  if (!recibo) notFound();
  return <VistaRecibo recibo={recibo} />;
}
