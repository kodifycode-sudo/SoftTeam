import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  MapPinned,
  PackageSearch,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { diasEntre, hoy } from "@/domain/fecha";
import { fechaCorta, numero } from "@/lib/formato";
import { productoUI } from "@/lib/productos";
import { cn } from "@/lib/utils";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { type ItemLicencia, licenciaDeEmpresa } from "@/server/modules/licencias/licencia-empresa";

export const metadata: Metadata = { title: "Inicio" };

function ValorItem({ item }: { item: ItemLicencia }) {
  if (item.clase === "FUNCION") {
    return (
      <li className="flex items-center gap-2 text-sm">
        <Check className="size-4 text-success" /> {item.nombre}
      </li>
    );
  }
  if (item.disponible !== null) {
    const porcentaje = item.total > 0 ? Math.round((item.disponible / item.total) * 100) : 0;
    const tono =
      porcentaje > 25 ? "bg-success" : porcentaje >= 10 ? "bg-warning" : "bg-destructive";
    return (
      <li className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span>{item.nombre}</span>
          <span className="tabular-nums">
            <strong>{numero(item.disponible)}</strong>
            <span className="text-muted-foreground"> / {numero(item.total)}</span>
          </span>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: <meter> no se puede estilizar igual en todos los navegadores; el role conserva la semántica. */}
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={item.total}
          aria-valuenow={item.disponible}
          aria-label={`${item.nombre}: ${porcentaje} % disponible`}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-all", tono)}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-baseline justify-between gap-2 text-sm">
      <span>{item.nombre}</span>
      <span className="font-semibold tabular-nums">
        {numero(item.total)}{" "}
        <span className="text-xs font-normal text-muted-foreground">{item.unidad}</span>
      </span>
    </li>
  );
}

export default async function InicioPortal({ searchParams }: PageProps<"/portal">) {
  const contexto = await requerirCliente();
  const { bienvenida } = await searchParams;
  const db = await obtenerDb();
  const fechaHoy = hoy();
  const licencia = await licenciaDeEmpresa(db, contexto.empresaId, fechaHoy);
  const nombre =
    contexto.nombreUsuario.split(",").at(-1)?.trim().split(" ")[0] ?? contexto.nombreUsuario;

  return (
    <>
      {bienvenida === "1" && (
        <Card className="mb-6 flex-row items-center gap-4 border-brand/40 bg-brand/10 p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-brand-foreground">
            <PartyPopper className="size-5" />
          </span>
          <div>
            <p className="font-semibold">¡Tu cuenta está lista!</p>
            <p className="text-sm text-muted-foreground">
              Creamos tu empresa y la oficina Casa central. El próximo paso es elegir los paquetes
              que necesitás.
            </p>
          </div>
        </Card>
      )}

      <EncabezadoPagina
        etiqueta={fechaCorta(fechaHoy)}
        titulo={`Hola, ${nombre}`}
        descripcion="Este es el estado de tus licencias."
      />

      <section className="relative mb-8 overflow-hidden rounded-3xl bg-navy p-6 text-navy-foreground sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand/25 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            {contexto.clienteNombre !== contexto.empresaNombre && (
              <p className="flex items-center gap-2 text-sm text-navy-foreground/60">
                <Building2 className="size-4" /> {contexto.clienteNombre}
              </p>
            )}
            <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {contexto.empresaNombre}
            </p>
            <p className="text-sm text-navy-foreground/70">
              Número de empresa{" "}
              <span className="font-mono font-semibold text-brand">{contexto.empresaNumero}</span> ·
              lo usan Prodigal, CotiWeb y BienSeguro para identificarte.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <p className="text-xs text-navy-foreground/60">Paquetes vigentes</p>
              <p className="text-2xl font-semibold tabular-nums">
                {licencia.contratosVigentes.length}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <p className="text-xs text-navy-foreground/60">Productos</p>
              <p className="text-2xl font-semibold tabular-nums">{licencia.productos.length}</p>
            </div>
          </div>
        </div>
      </section>

      {licencia.productos.length === 0 ? (
        <Empty className="border border-dashed bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>Todavía no tenés paquetes activos</EmptyTitle>
            <EmptyDescription>
              Elegí qué productos necesitás: gestión de cartera, cotización, portal para asegurados
              o notificaciones.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center">
            <Link href="/portal/paquetes" className={buttonVariants({ size: "lg" })}>
              <PackageSearch data-icon="inline-start" /> Ver paquetes disponibles
            </Link>
            <Link
              href="/portal/oficinas"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <MapPinned data-icon="inline-start" /> Configurar oficinas
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <BadgeCheck className="size-5 text-primary" /> Tu licencia hoy
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {licencia.productos.map((p) => {
                const ui = productoUI(p.productoId);
                return (
                  <Card key={p.productoId} className="gap-4">
                    <CardHeader className="flex-row items-center gap-3">
                      <span className={cn("grid size-10 place-items-center rounded-xl", ui.clase)}>
                        <ui.icono className="size-5" />
                      </span>
                      <CardTitle>{p.nombre}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {p.items
                          .filter((i) => i.total > 0)
                          .map((i) => (
                            <ValorItem key={i.recursoId} item={i} />
                          ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-primary" /> Vencimientos
              </CardTitle>
              <CardDescription>Paquetes vigentes y cuándo vencen.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {licencia.contratosVigentes.map((c) => {
                  const dias = c.hasta ? diasEntre(fechaHoy, c.hasta) : null;
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {c.paquete}
                          {c.cantidad > 1 && (
                            <span className="text-muted-foreground"> ×{c.cantidad}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.hasta ? `Hasta el ${fechaCorta(c.hasta)}` : "Hasta agotar el saldo"}
                        </p>
                      </div>
                      {dias !== null && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 tabular-nums",
                            dias <= 15 &&
                              "border-warning/50 bg-warning/10 text-[oklch(0.5_0.13_70)] dark:text-warning",
                          )}
                        >
                          {dias === 0 ? "Vence hoy" : `${dias} día${dias === 1 ? "" : "s"}`}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Link
                href="/portal/paquetes"
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "mt-2 w-full",
                })}
              >
                Sumar paquetes <ArrowRight data-icon="inline-end" />
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
