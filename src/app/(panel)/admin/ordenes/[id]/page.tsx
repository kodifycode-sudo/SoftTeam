import { ArrowLeft, Building2, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoOrden, VistaOrden } from "@/components/compra/vista-orden";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { fechaCorta, pesos } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerOrden } from "@/server/modules/ventas/ordenes";
import { AccionesOrden } from "./acciones-orden";

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
      <VistaOrden
        detalle={detalle}
        acciones={
          orden.estado === "PEND_PAGO" && rol === "ADMINISTRACION" ? (
            <AccionesOrden ordenId={orden.id} numero={orden.numero} total={pesos(orden.total)} />
          ) : undefined
        }
      />
    </>
  );
}
