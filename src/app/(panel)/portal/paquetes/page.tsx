import { Info, PackageOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TarjetaPaquete } from "@/components/catalogo/tarjeta-paquete";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { hoy } from "@/domain/fecha";
import { productoUI } from "@/lib/productos";
import { cn } from "@/lib/utils";
import {
  puedeContratar,
  requerirCliente,
  puedeComprar as tienePermisoComercial,
} from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarPaquetes } from "@/server/modules/catalogo/paquetes";
import { AgregarAlCarrito } from "../compra/agregar";
import { SelectorOficinaCompra } from "../compra/selector-oficina";

export const metadata: Metadata = { title: "Paquetes disponibles" };

export default async function PaquetesDisponibles({ searchParams }: PageProps<"/portal/paquetes">) {
  const contexto = await requerirCliente();
  const puedeComprar = puedeContratar(contexto);
  const { tipo, producto } = await searchParams;
  const tipoElegido = tipo === "CONSUMIBLE" ? "CONSUMIBLE" : "TEMPORAL";
  const db = await obtenerDb();
  // Solo paquetes públicos y a la venta hoy: el filtro va en el servidor, no en la pantalla.
  const catalogo = await listarPaquetes(db, { hoy: hoy(), tipo: tipoElegido, soloPublicos: true });
  // Los productos que aparecen en esta pestaña, para filtrar por el que interesa.
  const productos = [...new Set(catalogo.flatMap((p) => p.productos))];
  const productoElegido =
    typeof producto === "string" && productos.includes(producto) ? producto : undefined;
  // Los recomendados primero; el resto conserva el orden del catálogo.
  const paquetes = catalogo
    .filter((p) => !productoElegido || p.productos.includes(productoElegido))
    .sort((a, b) => Number(b.destacado) - Number(a.destacado));
  const hrefFiltro = (valor?: string) => {
    const url = new URLSearchParams();
    if (tipoElegido === "CONSUMIBLE") url.set("tipo", "CONSUMIBLE");
    if (valor) url.set("producto", valor);
    const consulta = url.toString();
    return consulta ? `/portal/paquetes?${consulta}` : "/portal/paquetes";
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Paquetes disponibles"
        descripcion={
          contexto.oficinaCompra
            ? `Lo que contrates queda asignado a ${contexto.oficinaCompra.etiqueta} y suma a la licencia de la empresa.`
            : "Combiná los paquetes que necesites: tu licencia es la suma de todos los que tengas vigentes."
        }
      />

      {contexto.oficinaCompra && contexto.oficinasCompra.length > 0 && (
        <SelectorOficinaCompra
          oficinas={contexto.oficinasCompra}
          actual={contexto.oficinaCompra.id}
        />
      )}

      {!puedeComprar && (
        <Alert className="mb-6 border-primary/20 bg-primary/5">
          <Info className="text-primary" />
          <AlertTitle>Solo consulta</AlertTitle>
          <AlertDescription>
            {tienePermisoComercial(contexto)
              ? "Tu canal todavía no tiene oficinas activas: la compra delegada asigna los paquetes a una oficina."
              : "Para contratar paquetes hace falta un administrador general o comercial de la empresa."}
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 inline-flex rounded-full border bg-card p-0.5">
        {(
          [
            ["TEMPORAL", "Planes mensuales y anuales"],
            ["CONSUMIBLE", "Créditos sin vencimiento"],
          ] as const
        ).map(([valor, texto]) => (
          <Link
            key={valor}
            href={valor === "TEMPORAL" ? "/portal/paquetes" : "/portal/paquetes?tipo=CONSUMIBLE"}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              tipoElegido === valor
                ? "bg-navy text-navy-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {texto}
          </Link>
        ))}
      </div>

      {productos.length > 1 && (
        <nav aria-label="Filtrar por producto" className="mb-6 flex flex-wrap gap-2">
          <Link
            href={hrefFiltro()}
            aria-current={!productoElegido ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              !productoElegido
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            Todos
          </Link>
          {productos.map((id) => {
            const ui = productoUI(id);
            const activo = productoElegido === id;
            return (
              <Link
                key={id}
                href={hrefFiltro(id)}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  activo
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <ui.icono className="size-3.5" /> {ui.nombre}
              </Link>
            );
          })}
        </nav>
      )}

      {paquetes.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>No hay paquetes de este tipo a la venta</EmptyTitle>
            <EmptyDescription>Probá con la otra pestaña o consultanos.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {paquetes.map((p) => (
            <TarjetaPaquete
              key={p.id}
              paquete={p}
              vista="cliente"
              accionAlternativa={
                puedeComprar
                  ? (a) => (
                      <AgregarAlCarrito
                        alternativaId={a.id}
                        etiqueta={`${p.nombre} · ${a.nombre}`}
                      />
                    )
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
