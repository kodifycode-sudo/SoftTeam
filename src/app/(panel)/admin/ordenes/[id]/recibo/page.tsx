import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VistaRecibo } from "@/components/compra/recibo";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerRecibo } from "@/server/modules/ventas/recibo";

export const metadata: Metadata = { title: "Recibo provisorio" };

export default async function ReciboAdmin({ params }: PageProps<"/admin/ordenes/[id]/recibo">) {
  await requerirSofteam();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const recibo = await obtenerRecibo(await obtenerDb(), id);
  if (!recibo) notFound();
  return <VistaRecibo recibo={recibo} />;
}
