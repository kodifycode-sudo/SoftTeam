import {
  Banknote,
  CircleAlert,
  Link2,
  Minus,
  PackageSearch,
  Plus,
  Receipt,
  Repeat,
  Sheet,
  ShoppingCart,
  TicketPercent,
  Trash2,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DesgloseOrden } from "@/components/compra/desglose";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { sumarDias } from "@/domain/fecha";
import { fechaCorta, pesos, porcentajeTexto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { oficinaDeCompra, requerirContratacion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarCarrito } from "@/server/modules/ventas/carrito";
import { cotizarCarrito, mediosParaEmpresa } from "@/server/modules/ventas/checkout";
import { cambiarCantidadAccion } from "../compra/acciones";
import { esRechazoDeTicket, mensajeRechazoCompra } from "../compra/mensajes";
import { SelectorOficinaCompra } from "../compra/selector-oficina";
import { ConfirmarOrden } from "./confirmar";

export const metadata: Metadata = { title: "Carrito" };

const ICONOS_MEDIO = {
  TRANSFERENCIA: Banknote,
  LINK_MP: Link2,
  SUSCRIPCION_MP: Repeat,
  PLANILLA: Sheet,
} as const;

const texto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : undefined;

function urlCarrito(medio?: string, ticket?: string) {
  const params = new URLSearchParams();
  if (medio) params.set("medio", medio);
  if (ticket) params.set("ticket", ticket);
  const q = params.toString();
  return `/portal/carrito${q ? `?${q}` : ""}`;
}

function BotonCantidad({
  itemId,
  cantidad,
  etiqueta,
  children,
}: {
  itemId: string;
  cantidad: number;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <form action={cambiarCantidadAccion}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="cantidad" value={cantidad} />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label={etiqueta}>
        {children}
      </Button>
    </form>
  );
}

export default async function Carrito({ searchParams }: PageProps<"/portal/carrito">) {
  const contexto = await requerirContratacion();
  const oficinaId = oficinaDeCompra(contexto);
  const sp = await searchParams;
  const medioElegido = texto(sp.medio);
  const ticketPedido = texto(sp.ticket)?.trim().toUpperCase() || undefined;
  const db = await obtenerDb();
  const items = await listarCarrito(db, contexto.empresaId, oficinaId);
  if (items.length === 0) {
    return (
      <>
        <EncabezadoPagina titulo="Tu carrito" />
        {contexto.oficinaCompra && contexto.oficinasCompra.length > 0 && (
          <SelectorOficinaCompra
            oficinas={contexto.oficinasCompra}
            actual={contexto.oficinaCompra.id}
          />
        )}
        <Empty className="border border-dashed bg-card py-14">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingCart />
            </EmptyMedia>
            <EmptyTitle>Tu carrito está vacío</EmptyTitle>
            <EmptyDescription>
              Elegí los paquetes que necesitás y volvé acá para confirmar la orden.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/portal/paquetes" className={buttonVariants({ size: "lg" })}>
              <PackageSearch data-icon="inline-start" /> Ver paquetes disponibles
            </Link>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  const medios = await mediosParaEmpresa(db, contexto.empresaId, items);
  // Si el ticket o el medio no aplican, se cotiza sin ellos y se explica por qué.
  let aviso: string | null = null;
  let errorTicket: string | null = null;
  let cotizacion = await cotizarCarrito(db, contexto.empresaId, {
    medioPagoId: medioElegido,
    ticketCodigo: ticketPedido,
    oficinaId,
  });
  if (!cotizacion.ok && esRechazoDeTicket(cotizacion.error)) {
    errorTicket = mensajeRechazoCompra(cotizacion.error);
    cotizacion = await cotizarCarrito(db, contexto.empresaId, {
      medioPagoId: medioElegido,
      oficinaId,
    });
  }
  if (!cotizacion.ok && cotizacion.error === "MEDIO_NO_HABILITADO" && medioElegido) {
    aviso = mensajeRechazoCompra(cotizacion.error);
    cotizacion = await cotizarCarrito(db, contexto.empresaId, {
      ticketCodigo: errorTicket ? undefined : ticketPedido,
      oficinaId,
    });
  }
  if (!cotizacion.ok) aviso = mensajeRechazoCompra(cotizacion.error, cotizacion.detalle);

  const c = cotizacion.ok ? cotizacion.valor : null;
  const medioActual = c?.medio.id;
  const ticketActual = c?.ticket?.codigo;

  return (
    <>
      <EncabezadoPagina
        titulo="Tu carrito"
        descripcion={
          contexto.oficinaCompra
            ? `Compra para ${contexto.oficinaCompra.etiqueta}: los paquetes quedan asignados a esa oficina.`
            : "Revisá los paquetes, elegí cómo pagar y confirmá la orden."
        }
      />
      {contexto.oficinaCompra && contexto.oficinasCompra.length > 0 && (
        <SelectorOficinaCompra
          oficinas={contexto.oficinasCompra}
          actual={contexto.oficinaCompra.id}
        />
      )}
      {aviso && (
        <Alert variant="destructive" className="mb-6">
          <CircleAlert />
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="size-4 text-primary" /> Paquetes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {items.map((item) => {
                  const linea = c?.lineas.find((l) => l.item.id === item.id);
                  return (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {item.paquete}
                          {item.tipoAccion === "RENOVACION" && (
                            <Badge variant="secondary">Renovación</Badge>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.alternativa} ·{" "}
                          {pesos(
                            item.tipoAccion === "RENOVACION"
                              ? item.precioRenovacion
                              : item.precioCompra,
                          )}{" "}
                          c/u
                          {item.tipoPaquete === "CONSUMIBLE" && " · sin vencimiento"}
                          {item.anteriorHasta &&
                            ` · desde el ${fechaCorta(sumarDias(item.anteriorHasta, 1))}`}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4 sm:justify-end">
                        {item.tipoAccion === "RENOVACION" ? (
                          <BotonCantidad
                            itemId={item.id}
                            cantidad={0}
                            etiqueta={`Quitar la renovación de ${item.paquete}`}
                          >
                            <Trash2 />
                          </BotonCantidad>
                        ) : (
                          <fieldset className="flex items-center rounded-lg border">
                            <legend className="sr-only">Cantidad de {item.paquete}</legend>
                            <BotonCantidad
                              itemId={item.id}
                              cantidad={item.cantidad - 1}
                              etiqueta="Una unidad menos"
                            >
                              {item.cantidad === 1 ? <Trash2 /> : <Minus />}
                            </BotonCantidad>
                            <span className="w-8 text-center text-sm font-medium tabular-nums">
                              {item.cantidad}
                            </span>
                            <BotonCantidad
                              itemId={item.id}
                              cantidad={Math.min(item.cantidad + 1, 99)}
                              etiqueta="Una unidad más"
                            >
                              <Plus />
                            </BotonCantidad>
                          </fieldset>
                        )}
                        <span className="w-32 text-right font-semibold tabular-nums">
                          {linea ? pesos(linea.calculo.precioFinal) : "—"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Medio de pago</CardTitle>
              <CardDescription>
                Algunos medios tienen un recargo o una bonificación, que se aplica antes del IVA.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 sm:grid-cols-2" aria-label="Medios de pago">
                {medios.map((m) => {
                  const Icono = ICONOS_MEDIO[m.tipo];
                  const elegido = m.id === medioActual;
                  return (
                    <li key={m.id}>
                      <Link
                        href={urlCarrito(m.id, ticketActual)}
                        aria-current={elegido ? "true" : undefined}
                        scroll={false}
                        className={cn(
                          "flex h-full items-start gap-3 rounded-xl border p-3.5 transition-colors hover:bg-muted/50",
                          elegido && "border-primary bg-primary/5 ring-1 ring-primary/30",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                            elegido && "border-primary",
                          )}
                        >
                          {elegido && <span className="size-2 rounded-full bg-primary" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <Icono className="size-4 text-muted-foreground" /> {m.nombre}
                          </span>
                          {m.ajustePorcentaje !== 0n && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "mt-1.5",
                                m.ajustePorcentaje < 0n
                                  ? "border-success/30 text-success"
                                  : "border-destructive/30 text-destructive",
                              )}
                            >
                              {m.ajustePorcentaje < 0n ? "Bonificación " : "Recargo "}
                              {porcentajeTexto(
                                m.ajustePorcentaje < 0n ? -m.ajustePorcentaje : m.ajustePorcentaje,
                              )}
                            </Badge>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {c?.tipoCliente !== "CORPORATIVO" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TicketPercent className="size-4 text-primary" /> ¿Tenés un código de descuento?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ticketActual ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-3 py-2.5">
                    <span className="text-sm">
                      Código <strong className="font-mono">{ticketActual}</strong> aplicado
                    </span>
                    <Link
                      href={urlCarrito(medioActual)}
                      scroll={false}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <X data-icon="inline-start" /> Quitar
                    </Link>
                  </div>
                ) : (
                  <form action="/portal/carrito" className="flex gap-2">
                    {medioActual && <input type="hidden" name="medio" value={medioActual} />}
                    <Input
                      key={errorTicket ? ticketPedido : "vacio"}
                      name="ticket"
                      defaultValue={errorTicket ? ticketPedido : ""}
                      placeholder="PROMO2026"
                      aria-label="Código de descuento"
                      aria-invalid={errorTicket ? true : undefined}
                      className="h-9 font-mono uppercase"
                      maxLength={20}
                    />
                    <Button type="submit" variant="secondary" className="h-9">
                      Aplicar
                    </Button>
                  </form>
                )}
                {errorTicket && <p className="text-sm text-destructive">{errorTicket}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" /> Resumen
            </CardTitle>
            {c && (
              <CardDescription>
                Pagás con {c.medio.nombre} · Factura {c.tipoComprobante} a{" "}
                {c.clienteFacturacion.nombre}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {c ? (
              <>
                <DesgloseOrden importes={c.calculo} codigoTicket={ticketActual} />
                <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                  {c.tipoCliente === "CORPORATIVO"
                    ? "Tus paquetes se habilitan al confirmar. El pago se gestiona según tu convenio."
                    : "Tus paquetes se activan cuando se acredita el pago. La vigencia empieza ese día: no perdés días."}
                </p>
                <ConfirmarOrden
                  medioPagoId={c.medio.id}
                  ticketCodigo={ticketActual ?? null}
                  claveIdempotencia={crypto.randomUUID()}
                  total={pesos(c.calculo.total)}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Resolvé el aviso de arriba para ver el total.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
