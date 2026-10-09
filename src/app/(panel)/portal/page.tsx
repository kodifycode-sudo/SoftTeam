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
  TriangleAlert,
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
import { abarcaOficina } from "@/domain/cuentas/alcance";
import { diasEntre, hoy, sumarDias } from "@/domain/fecha";
import { type Atencion, pendientesDeAtencion } from "@/domain/licencias/atencion";
import { estadoDeSaldo } from "@/domain/procesos/calendario";
import { fechaCorta, numero, pesos } from "@/lib/formato";
import { productoUI } from "@/lib/productos";
import { cn } from "@/lib/utils";
import {
  oficinaDeCompra,
  puedeComprar,
  puedeConfigurar,
  puedeContratar,
  requerirCliente,
} from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { pasosCompletados } from "@/server/modules/cuentas/primeros-pasos";
import { type ItemLicencia, licenciaDeEmpresa } from "@/server/modules/licencias/licencia-empresa";
import { leerParametroDe } from "@/server/modules/parametros";
import { estadoDeRenovacion } from "@/server/modules/procesos/renovacion-automatica";
import { type Renovable, renovablesDeEmpresa } from "@/server/modules/ventas/carrito";
import { RenovarPaquete } from "./compra/renovar";
import { PrimerosPasos } from "./primeros-pasos";
import { InterruptorRenovacion } from "./renovacion";

export const metadata: Metadata = { title: "Inicio" };

const TONOS_SALDO = {
  NORMAL: "bg-success",
  BAJO: "bg-warning",
  AGOTADO: "bg-destructive",
} as const;

function ValorItem({ item, porcentajeBajo }: { item: ItemLicencia; porcentajeBajo: number }) {
  if (item.clase === "FUNCION") {
    return (
      <li className="flex items-center gap-2 text-sm">
        <Check className="size-4 text-success" /> {item.nombre}
      </li>
    );
  }
  if (item.disponible !== null) {
    const porcentaje = item.total > 0 ? Math.round((item.disponible / item.total) * 100) : 0;
    // Mismo criterio que las alertas de saldo bajo (parámetro configurable).
    const tono = TONOS_SALDO[estadoDeSaldo(item.total, item.disponible, porcentajeBajo)];
    return (
      <li className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span>{item.nombre}</span>
          {/* Lo que queda, no lo usado: la barra se vacía a medida que se consume. */}
          <span className="shrink-0 tabular-nums">
            <span className="text-xs text-muted-foreground">quedan </span>
            <strong>{numero(item.disponible)}</strong>
            <span className="text-muted-foreground"> de {numero(item.total)}</span>
          </span>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: <meter> no se puede estilizar igual en todos los navegadores; el role conserva la semántica. */}
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={item.total}
          aria-valuenow={item.disponible}
          aria-label={`${item.nombre}: quedan ${numero(item.disponible)} de ${numero(item.total)}`}
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

/** Aviso arriba de todo cuando algo de la licencia pide atención (si no, nada). */
function AvisoAtencion({ atencion, comercial }: { atencion: Atencion; comercial: boolean }) {
  const { vencen, saldosBajos } = atencion;
  if (vencen.length === 0 && saldosBajos.length === 0) return null;
  return (
    <Card
      role="status"
      className="mb-6 flex-col gap-4 border-warning/50 bg-warning/10 p-5 sm:flex-row sm:items-start"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/20 text-[oklch(0.5_0.13_70)] dark:text-warning">
        <TriangleAlert className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">Hay cosas de tu licencia para revisar</p>
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {vencen.map((v) => (
            <li key={v.paquete}>
              <span className="font-medium text-foreground">{v.paquete}</span>{" "}
              {v.dias === 0 ? "vence hoy" : `vence en ${v.dias} día${v.dias === 1 ? "" : "s"}`} y no
              se renueva solo.
            </li>
          ))}
          {saldosBajos.map((c) => (
            <li key={c.nombre}>
              <span className="font-medium text-foreground">{c.nombre}</span>
              {c.agotado
                ? ": no queda saldo."
                : `: quedan ${numero(c.disponible)} de ${numero(c.total)}.`}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {vencen.length > 0 && (
          <a href="#vencimientos" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ver vencimientos
          </a>
        )}
        {comercial && (
          <Link href="/portal/paquetes" className={buttonVariants({ size: "sm" })}>
            Sumar paquetes
          </Link>
        )}
      </div>
    </Card>
  );
}

function EstadoRenovacionPaquete({
  contratoId,
  paquete,
  estado,
  comercial,
}: {
  contratoId: string;
  paquete: string;
  estado: { noRenovar: boolean; ordenRenovacion: number | null; aNegociar: boolean } | undefined;
  comercial: boolean;
}) {
  if (!estado) return null;
  if (estado.ordenRenovacion) {
    return (
      <p className="mt-1 text-xs font-medium text-primary">
        Renovación generada · orden #{estado.ordenRenovacion}
      </p>
    );
  }
  // Trimestre inicial: la continuidad se acuerda con SOFTeam (Mejora v2.1, 8.11).
  if (estado.aNegociar) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Trimestre inicial: antes del vencimiento acordamos con vos cómo seguir.
      </p>
    );
  }
  if (!comercial) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {estado.noRenovar ? "Sin renovación automática" : "Se renueva solo"}
      </p>
    );
  }
  return (
    <div className="mt-1.5">
      <InterruptorRenovacion
        contratoId={contratoId}
        paquete={paquete}
        renovar={!estado.noRenovar}
      />
    </div>
  );
}

/** "Renovar" para un paquete que se puede renovar a mano (si no, nada). */
function BotonRenovar({
  paquete,
  renovable,
}: {
  paquete: string;
  renovable: Renovable | undefined;
}) {
  if (!renovable?.hasta) return null;
  return (
    <RenovarPaquete
      paquete={paquete}
      contratoId={renovable.id}
      alternativaActual={renovable.alternativaId}
      desde={fechaCorta(sumarDias(renovable.hasta, 1))}
      opciones={renovable.alternativas.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        meses: a.meses,
        precio: pesos(a.precioRenovacion * BigInt(renovable.cantidad)),
      }))}
    />
  );
}

export default async function InicioPortal({ searchParams }: PageProps<"/portal">) {
  const contexto = await requerirCliente();
  const { bienvenida } = await searchParams;
  const db = await obtenerDb();
  const fechaHoy = hoy();
  const licencia = await licenciaDeEmpresa(db, contexto.empresaId, fechaHoy);
  // La licencia es de toda la empresa; un delegado ve y renueva solo los paquetes de sus oficinas.
  const delegado = contexto.alcance.tipo !== "empresa";
  const vencimientos = licencia.contratosVigentes.filter((c) =>
    abarcaOficina(contexto.alcance, c.oficina),
  );
  const renovaciones = await estadoDeRenovacion(
    db,
    contexto.empresaId,
    vencimientos.filter((c) => c.tipoPaquete === "TEMPORAL").map((c) => c.id),
  );
  const comercial = puedeComprar(contexto);
  const [[diasAviso], porcentajeBajo] = await Promise.all([
    leerParametroDe(db, "alertas.vencimiento_dias"),
    leerParametroDe(db, "alertas.saldo_bajo_porcentaje"),
  ]);
  /** Con renovación automática activa (o ya generada) no hay nada que hacer antes del vencimiento. */
  const renuevaSolo = (contratoId: string) => {
    const renovacion = renovaciones.get(contratoId);
    return !!renovacion && (!renovacion.noRenovar || renovacion.ordenRenovacion !== null);
  };
  const atencion = pendientesDeAtencion(
    fechaHoy,
    vencimientos.map((c) => ({
      paquete: c.paquete,
      hasta: c.hasta,
      renuevaSolo: renuevaSolo(c.id),
    })),
    licencia.productos.flatMap((p) =>
      p.items.flatMap((i) =>
        i.disponible === null
          ? []
          : [{ nombre: i.nombre, total: i.total, disponible: i.disponible }],
      ),
    ),
    { diasAviso, porcentajeBajo },
  );

  // Renovación manual: los paquetes de la bolsa que compra (empresa u oficina).
  const renovables = puedeContratar(contexto)
    ? await renovablesDeEmpresa(db, contexto.empresaId, oficinaDeCompra(contexto), fechaHoy)
    : [];
  const completados = await pasosCompletados(db, contexto.empresaId, licencia.productos.length > 0);
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
        descripcion={
          contexto.alcanceNombre
            ? `Administrás ${contexto.alcanceNombre}. La licencia es de toda la empresa.`
            : "Este es el estado de tus licencias."
        }
      />

      {!delegado && (
        <PrimerosPasos
          completados={completados}
          permisos={{ comercial, configuracion: puedeConfigurar(contexto) }}
        />
      )}

      <AvisoAtencion atencion={atencion} comercial={comercial} />

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
                            <ValorItem key={i.recursoId} item={i} porcentajeBajo={porcentajeBajo} />
                          ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <Card id="vencimientos" className="h-fit scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-primary" /> Vencimientos
              </CardTitle>
              <CardDescription>
                {delegado
                  ? "Paquetes asignados a tus oficinas y cuándo vencen."
                  : "Paquetes vigentes y cuándo vencen."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vencimientos.length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">
                  Todavía no hay paquetes asignados a tus oficinas.
                </p>
              )}
              <ul className="divide-y">
                {vencimientos.map((c) => {
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
                        <EstadoRenovacionPaquete
                          contratoId={c.id}
                          paquete={c.paquete}
                          estado={renovaciones.get(c.id)}
                          comercial={comercial}
                        />
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {dias !== null && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "tabular-nums",
                              dias <= diasAviso &&
                                !renuevaSolo(c.id) &&
                                "border-warning/50 bg-warning/10 text-[oklch(0.5_0.13_70)] dark:text-warning",
                            )}
                          >
                            {dias === 0 ? "Vence hoy" : `${dias} día${dias === 1 ? "" : "s"}`}
                          </Badge>
                        )}
                        <BotonRenovar
                          paquete={c.paquete}
                          renovable={renovables.find((r) => r.id === c.id)}
                        />
                      </div>
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
