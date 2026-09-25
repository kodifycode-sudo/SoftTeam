import {
  ArrowRight,
  Building2,
  CreditCard,
  FileClock,
  Package,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Indicador } from "@/components/panel/indicador";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { hoy } from "@/domain/fecha";
import { fechaCorta, numero, pesos } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { indicadoresTablero } from "@/server/modules/cuentas/consultas";

export const metadata: Metadata = { title: "Tablero" };

const ACCESOS = [
  {
    href: "/admin/clientes",
    titulo: "Clientes",
    detalle: "Cuentas, empresas y contactos",
    icono: UsersRound,
  },
  {
    href: "/admin/paquetes",
    titulo: "Paquetes",
    detalle: "Catálogo, límites y precios",
    icono: Package,
  },
  {
    href: "/admin/medios-pago",
    titulo: "Medios de pago",
    detalle: "Ajustes y habilitaciones",
    icono: CreditCard,
  },
];

export default async function Tablero() {
  const { user } = await requerirSofteam();
  const db = await obtenerDb();
  const datos = await indicadoresTablero(db, hoy());
  const nombre = user.name.split(/[\s,]+/)[0];

  return (
    <>
      <EncabezadoPagina
        etiqueta={fechaCorta(hoy())}
        titulo={`Hola, ${nombre}`}
        descripcion="Así está la cartera de clientes y el cobro hoy."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Clientes activos"
          valor={numero(datos.clientesActivos)}
          icono={UsersRound}
        />
        <Indicador
          titulo="Empresas activas"
          valor={numero(datos.empresasActivas)}
          icono={Building2}
          tono="marca"
        />
        <Indicador
          titulo="Contratos vigentes"
          valor={numero(datos.contratosVigentes)}
          icono={ShieldCheck}
          tono="exito"
        />
        <Indicador
          titulo="Órdenes pendientes de pago"
          valor={numero(datos.ordenesPendientes)}
          detalle={`${pesos(String(datos.importePendiente))} a cobrar`}
          icono={FileClock}
          tono="alerta"
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Últimas altas</CardTitle>
            <CardDescription>Clientes registrados más recientemente.</CardDescription>
            <CardAction>
              <Link
                href="/admin/clientes"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Ver todos <ArrowRight data-icon="inline-end" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {datos.ultimosClientes.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersRound />
                  </EmptyMedia>
                  <EmptyTitle>Todavía no hay clientes</EmptyTitle>
                  <EmptyDescription>
                    Cuando un broker se registre, lo vas a ver acá.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="divide-y">
                {datos.ultimosClientes.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/clientes/${c.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground">
                        {c.nombre.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          Cliente #{c.numero}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fechaCorta(c.creadoEn)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-3">
          {ACCESOS.map(({ href, titulo, detalle, icono: Icono }) => (
            <Link key={href} href={href} className="group">
              <Card className="flex-row items-center gap-4 p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy text-brand">
                  <Icono className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{titulo}</span>
                  <span className="block text-sm text-muted-foreground">{detalle}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
