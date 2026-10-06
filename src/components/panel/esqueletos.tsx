import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Esqueletos de carga para los `loading.tsx` del panel. Imitan la forma de
 * cada tipo de pantalla (tablero, listado, detalle, formulario) para que el
 * contenido no salte al llegar.
 */

/** Contenedor accesible: anuncia la carga y oculta los bloques a lectores de pantalla. */
function Cargando({ children }: { children: ReactNode }) {
  return (
    <output aria-busy="true" className="block">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden>{children}</div>
    </output>
  );
}

export function EsqueletoEncabezado({ acciones = true }: { acciones?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56 sm:h-9" />
        <Skeleton className="h-4 w-72 max-w-full sm:w-96" />
      </div>
      {acciones && <Skeleton className="h-8 w-32" />}
    </div>
  );
}

export function EsqueletoIndicadores({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <section
      className={cn(
        "grid gap-4 sm:grid-cols-2",
        cantidad === 3 ? "lg:grid-cols-3" : "xl:grid-cols-4",
      )}
    >
      {Array.from({ length: cantidad }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
        <Card key={i} className="gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="size-9 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-16" />
        </Card>
      ))}
    </section>
  );
}

export function EsqueletoTabla({ filas = 8, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex gap-6 border-b bg-muted/50 px-4 py-3">
        {Array.from({ length: columnas }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
          <Skeleton key={i} className={cn("h-4", i === 0 ? "w-1/3" : "hidden flex-1 sm:block")} />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: filas }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
          <div key={i} className="flex items-center gap-6 px-4 py-3.5">
            <div className="w-1/3 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            {Array.from({ length: columnas - 1 }, (_, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
              <Skeleton key={j} className="hidden h-4 flex-1 sm:block" />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Tarjeta genérica con título y renglones. */
export function EsqueletoTarjeta({ renglones = 4 }: { renglones?: number }) {
  return (
    <Card className="gap-4 p-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: renglones }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
          <Skeleton key={i} className={cn("h-4", i % 3 === 2 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </Card>
  );
}

/** Tablero: indicadores, una lista principal y una columna de accesos. */
export function EsqueletoTablero() {
  return (
    <Cargando>
      <EsqueletoEncabezado acciones={false} />
      <EsqueletoIndicadores />
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <EsqueletoTarjeta renglones={6} />
        <div className="grid content-start gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
            <Card key={i} className="flex-row items-center gap-4 p-4">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </Card>
          ))}
        </div>
      </section>
    </Cargando>
  );
}

/** Listado: encabezado con acciones, buscador y tabla. */
export function EsqueletoListado({ buscador = true }: { buscador?: boolean }) {
  return (
    <Cargando>
      <EsqueletoEncabezado />
      {buscador && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-24" />
        </div>
      )}
      <EsqueletoTabla />
    </Cargando>
  );
}

/** Detalle: columna principal con tarjetas y columna lateral de datos. */
export function EsqueletoDetalle() {
  return (
    <Cargando>
      <EsqueletoEncabezado />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid content-start gap-6">
          <EsqueletoTarjeta renglones={5} />
          <EsqueletoTabla filas={4} />
        </div>
        <div className="grid content-start gap-6">
          <EsqueletoTarjeta renglones={3} />
          <EsqueletoTarjeta renglones={3} />
        </div>
      </div>
    </Cargando>
  );
}

/** Formulario: tarjetas con pares etiqueta / campo. */
export function EsqueletoFormulario({ secciones = 2 }: { secciones?: number }) {
  return (
    <Cargando>
      <EsqueletoEncabezado acciones={false} />
      <div className="grid max-w-3xl gap-6">
        {Array.from({ length: secciones }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
          <Card key={i} className="gap-5 p-6">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
                <div key={j} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </Card>
        ))}
        <Skeleton className="h-9 w-32" />
      </div>
    </Cargando>
  );
}

/** Reportes: pestañas, indicadores y tabla. */
export function EsqueletoReporte() {
  return (
    <Cargando>
      <EsqueletoEncabezado acciones={false} />
      <div className="mb-6 flex gap-6 border-b pb-3">
        {["w-20", "w-28", "w-24", "w-20"].map((ancho, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: bloques fijos sin identidad.
          <Skeleton key={i} className={cn("h-4", ancho)} />
        ))}
      </div>
      <EsqueletoIndicadores cantidad={3} />
      <div className="mt-6">
        <EsqueletoTabla filas={6} columnas={5} />
      </div>
    </Cargando>
  );
}
