"use client";

import { Building2 } from "lucide-react";
import { useRef } from "react";
import { SidebarGroup } from "@/components/ui/sidebar";
import { elegirEmpresa } from "./acciones";

/** Selector de empresa activa en la barra lateral (solo si administra más de una). */
export function SelectorEmpresa({
  empresas,
  actual,
}: {
  empresas: { id: string; nombre: string; numero: number }[];
  actual: string;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <form ref={formulario} action={elegirEmpresa}>
        <label
          htmlFor="selector-empresa"
          className="mb-1.5 flex items-center gap-1.5 px-2 text-[0.68rem] font-medium uppercase tracking-wider text-sidebar-foreground/50"
        >
          <Building2 className="size-3.5" /> Empresa
        </label>
        <select
          id="selector-empresa"
          name="empresaId"
          defaultValue={actual}
          onChange={() => formulario.current?.requestSubmit()}
          className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-2 text-sm text-sidebar-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre} · #{e.numero}
            </option>
          ))}
        </select>
      </form>
    </SidebarGroup>
  );
}
