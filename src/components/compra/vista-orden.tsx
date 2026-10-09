import {
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Clock,
  CreditCard,
  Info,
  Receipt,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { fechaCorta, pesos } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { DetalleOrden } from "@/server/modules/ventas/ordenes";
import { DesgloseOrden } from "./desglose";

export const ESTADOS_ORDEN = {
  PEND_PAGO: {
    etiqueta: "Pendiente de pago",
    icono: Clock,
    clase: "border-warning/50 bg-warning/10 text-[oklch(0.45_0.12_70)] dark:text-warning",
  },
  PAGADA: {
    etiqueta: "Pagada",
    icono: CircleCheck,
    clase: "border-success/40 bg-success/10 text-success",
  },
  CANCELADA: {
    etiqueta: "Cancelada",
    icono: XCircle,
    clase: "border-destructive/30 bg-destructive/5 text-destructive",
  },
} as const;

const ESTADO_CONTRATO_POR_DEFECTO = {
  etiqueta: "Se activa al pagar",
  clase: "text-muted-foreground",
};

const ESTADOS_CONTRATO: Record<string, { etiqueta: string; clase: string }> = {
  PEND_PAGO: { etiqueta: "Se activa al pagar", clase: "text-muted-foreground" },
  PEND_PAGO_ACTIVO: { etiqueta: "Habilitado", clase: "text-success" },
  ACTIVO: { etiqueta: "Activo", clase: "text-success" },
  CANCELADO: { etiqueta: "Cancelado", clase: "text-destructive" },
  BAJA: { etiqueta: "Dado de baja", clase: "text-muted-foreground" },
};

export function EstadoOrden({ estado }: { estado: keyof typeof ESTADOS_ORDEN }) {
  const e = ESTADOS_ORDEN[estado];
  return (
    <Badge variant="outline" className={cn("gap-1", e.clase)}>
      <e.icono className="size-3.5" /> {e.etiqueta}
    </Badge>
  );
}

function Dato({
  icono,
  etiqueta,
  children,
}: {
  icono: ReactNode;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icono}</span>
      <div>
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <p className="text-sm font-medium">{children}</p>
      </div>
    </div>
  );
}

/** Vista completa de una orden: encabezado, líneas y desglose congelado. */
export function VistaOrden({
  detalle,
  acciones,
  urlRecibo,
}: {
  detalle: DetalleOrden;
  acciones?: ReactNode;
  /** Recibo provisorio (orden pagada). */
  urlRecibo?: string;
}) {
  const { orden, medio, lineas, facturacion, ticket } = detalle;
  const pendiente = orden.estado === "PEND_PAGO";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <div className="space-y-6">
        {pendiente && orden.pagoError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>No se pudo cobrar el último intento de pago</AlertTitle>
            <AlertDescription>
              {orden.pagoErrorDetalle ?? "El pago fue rechazado."} Podés volver a intentarlo con
              otra tarjeta o medio.
            </AlertDescription>
          </Alert>
        )}
        {pendiente && !medio.generaLink && medio.instrucciones && (
          <Alert className="border-primary/20 bg-primary/5">
            <Info className="text-primary" />
            <AlertTitle>Cómo pagar: {medio.nombre}</AlertTitle>
            <AlertDescription className="whitespace-pre-line">
              {medio.instrucciones}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <Dato icono={<CalendarDays className="size-4" />} etiqueta="Emitida">
              {fechaCorta(orden.emitidaEn)}
            </Dato>
            <Dato icono={<CreditCard className="size-4" />} etiqueta="Medio de pago">
              {medio.nombre}
            </Dato>
            <Dato
              icono={<Receipt className="size-4" />}
              etiqueta={`Factura ${orden.tipoComprobante}`}
            >
              {facturacion?.nombreFactura}
              {facturacion && (
                <span className="block text-xs font-normal text-muted-foreground">
                  CUIT {formatearCuit(facturacion.cuit)}
                </span>
              )}
              {orden.emisorRazonSocial && (
                <span className="block text-xs font-normal text-muted-foreground">
                  Emite {orden.emisorRazonSocial}
                  {orden.emisorCuit && ` · CUIT ${formatearCuit(orden.emisorCuit)}`}
                </span>
              )}
              {orden.facturaNumero ? (
                <span className="mt-1 block text-xs font-medium text-success">
                  Comprobante{" "}
                  <span className="whitespace-nowrap tabular-nums">{orden.facturaNumero}</span>
                </span>
              ) : (
                orden.estado === "PAGADA" && (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    Comprobante en emisión
                  </span>
                )
              )}
              {orden.estado === "PAGADA" && urlRecibo && (
                <Link
                  href={urlRecibo}
                  className="mt-1 block text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ver recibo provisorio
                </Link>
              )}
            </Dato>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paquetes</CardTitle>
            <CardDescription>
              {pendiente
                ? "Cada paquete se activa cuando se acredita el pago (los habilitados ya están en uso)."
                : "Estado de cada paquete de la orden."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {lineas.map((l) => {
                const estado = ESTADOS_CONTRATO[l.estadoContrato] ?? ESTADO_CONTRATO_POR_DEFECTO;
                return (
                  <li
                    key={l.id}
                    className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{l.descripcion}</p>
                      <p className={cn("text-xs", estado.clase)}>
                        {estado.etiqueta}
                        {l.desde &&
                          (l.hasta
                            ? ` · del ${fechaCorta(l.desde)} al ${fechaCorta(l.hasta)}`
                            : ` · desde el ${fechaCorta(l.desde)}`)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{pesos(l.precioFinal)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {pesos(l.totalProrrateado)} con impuestos
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-4 text-primary" /> Importes
          </CardTitle>
          <CardDescription>Congelados al confirmar la orden.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DesgloseOrden importes={orden} codigoTicket={ticket?.codigo} />
          {acciones}
        </CardContent>
      </Card>
    </div>
  );
}
