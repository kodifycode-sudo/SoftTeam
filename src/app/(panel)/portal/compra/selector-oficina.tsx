"use client";

import { MapPinned } from "lucide-react";
import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { elegirOficinaCompra } from "../acciones";

/**
 * Delegado de canal: para qué oficina compra. Cada oficina tiene su propio
 * carrito, y lo que se confirma queda asignado a ella.
 */
export function SelectorOficinaCompra({
  oficinas,
  actual,
}: {
  oficinas: { id: string; etiqueta: string }[];
  actual: string;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  return (
    <Card className="mb-6 flex-col gap-3 border-brand/40 bg-brand/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-primary">
          <MapPinned className="size-5" />
        </span>
        <div>
          <label htmlFor="oficina-compra" className="text-sm font-medium">
            Comprar para
          </label>
          <p className="text-xs text-muted-foreground">
            Cada oficina tiene su carrito; los paquetes quedan asignados a ella.
          </p>
        </div>
      </div>
      <form ref={formulario} action={elegirOficinaCompra} className="sm:w-80">
        <select
          key={actual}
          id="oficina-compra"
          name="oficinaId"
          defaultValue={actual}
          onChange={() => formulario.current?.requestSubmit()}
          className="h-10 w-full rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {oficinas.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </form>
    </Card>
  );
}
