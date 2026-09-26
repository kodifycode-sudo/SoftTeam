import { ChevronRight, Download, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EstadoOrden } from "@/components/compra/vista-orden";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { fechaCorta, pesos } from "@/lib/formato";
import { requerirComercial } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarOrdenes } from "@/server/modules/ventas/ordenes";

export const metadata: Metadata = { title: "Mis órdenes" };

export default async function MisOrdenes() {
  const contexto = await requerirComercial();
  const db = await obtenerDb();
  const ordenes = await listarOrdenes(db, {
    empresaId: contexto.empresaId,
    clienteId: contexto.clienteId,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Mis órdenes"
        descripcion="Tus compras y renovaciones, con su estado de pago."
        acciones={
          <a href="/portal/ordenes/exportar" className={buttonVariants({ variant: "outline" })}>
            <Download data-icon="inline-start" /> Exportar a Excel
          </a>
        }
      />
      {ordenes.length === 0 ? (
        <Empty className="border border-dashed bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>Todavía no tenés órdenes</EmptyTitle>
            <EmptyDescription>Cuando confirmes el carrito, la orden aparece acá.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/portal/paquetes" className={buttonVariants()}>
              Ver paquetes disponibles
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {ordenes.map((o) => (
            <li key={o.id}>
              <Link href={`/portal/ordenes/${o.id}`} className="group block">
                <Card className="flex-row items-center gap-4 p-4 transition-shadow group-hover:shadow-md sm:p-5">
                  <span className="hidden size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:grid">
                    <Receipt className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">Orden #{o.numero}</p>
                      <EstadoOrden estado={o.estado} />
                      {o.tipoGeneracion === "RENOVACION" && (
                        <Badge variant="secondary">Renovación</Badge>
                      )}
                      {o.agrupada && <Badge variant="outline">Facturación agrupada</Badge>}
                      {o.estado === "PEND_PAGO" && o.pagoError && (
                        <Badge variant="destructive">Pago rechazado</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {fechaCorta(o.emitidaEn)} · {o.items} paquete{o.items === 1 ? "" : "s"} ·{" "}
                      {o.medio}
                      {o.facturaNumero && ` · Factura ${o.facturaNumero}`}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-semibold tabular-nums">{pesos(o.total)}</p>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
