import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SelectorTema } from "@/components/tema";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BarraLateral } from "./barra-lateral";
import type { UsuarioMenu } from "./menu-usuario";

/** Estructura común de los paneles: barra lateral, encabezado fijo y contenido. */
export async function EstructuraPanel({
  variante,
  usuario,
  permisos,
  encabezado,
  extraBarra,
  children,
}: {
  variante: "admin" | "portal";
  usuario: UsuarioMenu;
  /** Rol SOFTeam o permisos del cliente: filtran el menú. */
  permisos: readonly string[];
  encabezado?: ReactNode;
  extraBarra?: ReactNode;
  children: ReactNode;
}) {
  const abierta = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={abierta}>
      <BarraLateral variante={variante} usuario={usuario} permisos={permisos} pie={extraBarra} />
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:px-4 print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">{encabezado}</div>
          <SelectorTema />
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** Título de página con descripción y acciones (responsive: las acciones bajan en celular). */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  etiqueta,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  etiqueta?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {etiqueta && <div className="text-sm font-medium text-primary">{etiqueta}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{titulo}</h1>
        {descripcion && (
          <p className="max-w-2xl text-sm text-muted-foreground text-pretty">{descripcion}</p>
        )}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}
