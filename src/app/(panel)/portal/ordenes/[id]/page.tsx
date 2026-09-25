import { ArrowLeft, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoOrden, VistaOrden } from "@/components/compra/vista-orden";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requerirComercial } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerOrden } from "@/server/modules/ventas/ordenes";

export const metadata: Metadata = { title: "Orden" };

export default async function OrdenPortal({
  params,
  searchParams,
}: PageProps<"/portal/ordenes/[id]">) {
  const contexto = await requerirComercial();
  const [{ id }, { nueva }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await obtenerDb();
  // Acotada a la empresa: una orden ajena responde 404, no 403 (no revela que existe).
  const detalle = await obtenerOrden(db, id, { empresaId: contexto.empresaId });
  if (!detalle) notFound();

  return (
    <>
      <Link
        href="/portal/ordenes"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-3" })}
      >
        <ArrowLeft data-icon="inline-start" /> Mis órdenes
      </Link>
      {nueva === "1" && (
        <Card className="mb-6 flex-row items-center gap-4 border-success/30 bg-success/5 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-success text-success-foreground">
            <PartyPopper className="size-5" />
          </span>
          <div>
            <p className="font-semibold">¡Orden confirmada!</p>
            <p className="text-sm text-muted-foreground">
              Te dejamos abajo cómo pagarla. Apenas se acredite, tus paquetes se activan solos.
            </p>
          </div>
        </Card>
      )}
      <EncabezadoPagina
        titulo={`Orden #${detalle.orden.numero}`}
        acciones={<EstadoOrden estado={detalle.orden.estado} />}
      />
      <VistaOrden detalle={detalle} />
    </>
  );
}
