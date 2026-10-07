import {
  ArrowRight,
  Banknote,
  CreditCard,
  FileClock,
  Package,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Indicador, type VariacionIndicador } from "@/components/panel/indicador";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { type Fecha, hoy, sumarDias } from "@/domain/fecha";
import { periodosComparables, variacion } from "@/domain/reportes/periodos";
import { fechaCorta, numero, pesos, porcentajeTexto } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { indicadoresTablero } from "@/server/modules/cuentas/consultas";
import { tieneDosFactores } from "@/server/modules/cuentas/dos-factores";
import { tendenciasTablero } from "@/server/modules/reportes/reportes";

export const metadata: Metadata = { title: "Tablero" };

const ACCESOS = [
  {
    href: "/admin/ordenes",
    titulo: "Órdenes",
    detalle: "Cobranza y activación de paquetes",
    icono: FileClock,
  },
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

const MES_CORTO = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" });
const mesCorto = (mes: string) =>
  MES_CORTO.format(new Date(`${mes}-15T12:00:00Z`)).replace(".", "");

/** "vs. 1–6 sept": el mismo tramo del mes anterior, con nombre. */
function etiquetaPeriodo(fechaHoy: Fecha): string {
  const { anterior } = periodosComparables(fechaHoy);
  const ultimo = sumarDias(anterior.hasta, -1);
  return `vs. 1–${Number(ultimo.slice(8))} ${mesCorto(ultimo.slice(0, 7))}`;
}

/** Variación para conteos: la diferencia absoluta, que con números chicos dice más que el porcentaje. */
function variacionConteo(
  { actual, anterior }: { actual: number; anterior: number },
  [singular, plural]: [string, string],
  periodo: string,
): VariacionIndicador {
  const v = variacion(BigInt(actual), BigInt(anterior));
  const cantidad = Math.abs(actual - anterior);
  return {
    sentido: v.sentido,
    texto:
      v.sentido === "igual"
        ? "Sin cambios"
        : `${v.sentido === "sube" ? "+" : "−"}${numero(cantidad)} ${cantidad === 1 ? singular : plural}`,
    periodo,
  };
}

/** Variación para importes: el porcentaje, o "Nuevo" si antes no había. */
function variacionImporte(actual: bigint, anterior: bigint, periodo: string): VariacionIndicador {
  const v = variacion(actual, anterior);
  const texto =
    v.sentido === "igual"
      ? "Sin cambios"
      : v.porcentaje === null
        ? "Nuevo"
        : `${v.porcentaje > 0n ? "+" : "−"}${porcentajeTexto(v.porcentaje < 0n ? -v.porcentaje : v.porcentaje)}`;
  return { sentido: v.sentido, texto, periodo };
}

export default async function Tablero() {
  const { user } = await requerirSofteam();
  const db = await obtenerDb();
  const fechaHoy = hoy();
  const [datos, dosFactores, tendencias] = await Promise.all([
    indicadoresTablero(db, fechaHoy),
    tieneDosFactores(db, user.id),
    tendenciasTablero(db, fechaHoy),
  ]);
  const periodo = etiquetaPeriodo(fechaHoy);
  const { comparacion } = tendencias;
  const etiquetas = (valores: string[]) =>
    tendencias.meses.map((m, i) => `${mesCorto(m)}: ${valores[i]}`);
  const nombre = user.name.split(/[\s,]+/)[0];

  return (
    <>
      <EncabezadoPagina
        etiqueta={fechaCorta(hoy())}
        titulo={`Hola, ${nombre}`}
        descripcion="Así está la cartera de clientes y el cobro hoy."
      />

      {!dosFactores && (
        <Alert className="mb-6 border-warning/50 bg-warning/10">
          <ShieldAlert />
          <AlertTitle>Protegé tu usuario con la verificación en dos pasos</AlertTitle>
          <AlertDescription>
            <p>
              Con tu usuario se pueden ver y cambiar los datos de todos los clientes. Además de la
              contraseña, pedí un código de tu celular al ingresar.
            </p>
            <Link
              href="/admin/seguridad"
              className={buttonVariants({ size: "sm", variant: "outline", className: "mt-2" })}
            >
              Activarla ahora
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Clientes activos"
          valor={numero(datos.clientesActivos)}
          detalle={`${numero(datos.empresasActivas)} empresas activas`}
          icono={UsersRound}
          variacion={variacionConteo(comparacion.altasClientes, ["alta", "altas"], periodo)}
          tendencia={{
            valores: tendencias.altasClientes,
            etiquetas: etiquetas(tendencias.altasClientes.map((n) => `${numero(n)} altas`)),
            descripcion: "Altas de clientes por mes en los últimos 12 meses",
          }}
        />
        <Indicador
          titulo="Contratos vigentes"
          valor={numero(datos.contratosVigentes)}
          icono={ShieldCheck}
          tono="exito"
          variacion={variacionConteo(
            comparacion.contratosActivados,
            ["activado", "activados"],
            periodo,
          )}
          tendencia={{
            valores: tendencias.contratosActivados,
            etiquetas: etiquetas(
              tendencias.contratosActivados.map((n) => `${numero(n)} activados`),
            ),
            descripcion: "Contratos activados por mes en los últimos 12 meses",
          }}
        />
        <Indicador
          titulo="Cobrado en el mes"
          valor={pesos(comparacion.cobrado.actual)}
          icono={Banknote}
          tono="marca"
          variacion={variacionImporte(
            comparacion.cobrado.actual,
            comparacion.cobrado.anterior,
            periodo,
          )}
          tendencia={{
            // Solo para la altura de las columnas: los importes se muestran con `pesos`.
            valores: tendencias.cobrado.map((c) => Number(c / 100n)),
            etiquetas: etiquetas(tendencias.cobrado.map((c) => pesos(c))),
            descripcion: "Cobranza por mes en los últimos 12 meses",
          }}
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
