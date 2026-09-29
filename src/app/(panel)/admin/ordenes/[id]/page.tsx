import { ArrowLeft, Building2, CircleCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoOrden, VistaOrden } from "@/components/compra/vista-orden";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { fechaCorta, pesos } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerOrden } from "@/server/modules/ventas/ordenes";
import { marcarRevisadaAccion } from "../acciones";
import { AccionesOrden } from "./acciones-orden";
import { Bonificar } from "./bonificar";
import { EmitirFactura, ReenviarLink } from "./cobro";

export const metadata: Metadata = { title: "Orden" };

function textoAviso(aviso: unknown, activados: unknown): string | null {
  if (aviso === "cancelada") return "Orden cancelada. Sus paquetes dejaron de sumar a la licencia.";
  if (aviso !== "pago") return null;
  const n = Number(activados) || 0;
  return `Pago registrado: ${n} paquete${n === 1 ? "" : "s"} activado${n === 1 ? "" : "s"}.`;
}

export default async function OrdenAdmin({
  params,
  searchParams,
}: PageProps<"/admin/ordenes/[id]">) {
  const { rol } = await requerirSofteam();
  const [{ id }, { aviso, activados }] = await Promise.all([params, searchParams]);
  const mensaje = textoAviso(aviso, activados);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await obtenerDb();
  const detalle = await obtenerOrden(db, id);
  if (!detalle) notFound();
  const { orden, empresa } = detalle;

  return (
    <>
      <Link
        href="/admin/ordenes"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-3" })}
      >
        <ArrowLeft data-icon="inline-start" /> Órdenes
      </Link>
      {mensaje && (
        <Alert className="mb-5 border-success/30 bg-success/5">
          <CircleCheck className="text-success" />
          <AlertDescription className="text-success">{mensaje}</AlertDescription>
        </Alert>
      )}
      <EncabezadoPagina
        etiqueta={
          empresa ? (
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-4" /> {empresa.nombre} · Empresa #{empresa.numero}
            </span>
          ) : undefined
        }
        titulo={`Orden #${orden.numero}`}
        descripcion={
          orden.estado === "PAGADA"
            ? `Pagada el ${fechaCorta(orden.pagadaEn)}`
            : orden.estado === "CANCELADA"
              ? `Cancelada el ${fechaCorta(orden.canceladaEn)}`
              : undefined
        }
        acciones={<EstadoOrden estado={orden.estado} />}
      />
      {orden.requiereRevision && (
        <Alert className="mb-6 border-warning/50 bg-warning/10">
          <TriangleAlert className="text-[oklch(0.5_0.13_70)]" />
          <AlertTitle>Requiere revisión</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="whitespace-pre-line">{orden.observaciones ?? "Revisar esta orden."}</p>
            {rol === "ADMINISTRACION" && (
              <form action={marcarRevisadaAccion}>
                <input type="hidden" name="ordenId" value={orden.id} />
                <Button type="submit" size="sm" variant="outline">
                  Marcar como revisada
                </Button>
              </form>
            )}
          </AlertDescription>
        </Alert>
      )}
      <VistaOrden
        detalle={detalle}
        urlRecibo={`/admin/ordenes/${detalle.orden.id}/recibo`}
        acciones={
          <div className="grid gap-2">
            {orden.estado === "PEND_PAGO" && rol === "ADMINISTRACION" && (
              <AccionesOrden ordenId={orden.id} numero={orden.numero} total={pesos(orden.total)} />
            )}
            {orden.estado === "PEND_PAGO" &&
              !orden.ticketId &&
              (rol === "ADMINISTRACION" || rol === "COMERCIAL") && (
                <Bonificar
                  ordenId={orden.id}
                  lineas={detalle.lineas.map((l) => ({
                    contratoId: l.contratoId,
                    descripcion: l.descripcion,
                  }))}
                />
              )}
            {orden.estado === "PEND_PAGO" && detalle.medio.generaLink && rol !== "SOPORTE" && (
              <ReenviarLink ordenId={orden.id} reenvios={orden.linkReenvios} />
            )}
            {orden.estado === "PAGADA" && !orden.facturadaEn && rol === "ADMINISTRACION" && (
              <EmitirFactura ordenId={orden.id} />
            )}
          </div>
        }
      />
    </>
  );
}
