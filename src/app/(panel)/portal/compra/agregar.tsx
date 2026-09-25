"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { BotonEnviar } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { agregarAlCarritoAccion } from "./acciones";

/** Selector de cantidad + botón para agregar una alternativa al carrito. */
export function AgregarAlCarrito({
  alternativaId,
  etiqueta,
}: {
  alternativaId: string;
  etiqueta: string;
}) {
  const [estado, accion] = useActionState(agregarAlCarritoAccion, ESTADO_INICIAL);
  const [cantidad, setCantidad] = useState(1);

  useEffect(() => {
    if (!estado.mensaje) return;
    if (estado.ok) {
      toast.success(estado.mensaje, {
        description: etiqueta,
        action: { label: "Ver carrito", onClick: () => window.location.assign("/portal/carrito") },
      });
      setCantidad(1);
    } else {
      toast.error(estado.mensaje);
    }
  }, [estado, etiqueta]);

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="alternativaId" value={alternativaId} />
      <input type="hidden" name="cantidad" value={cantidad} />
      <fieldset className="flex items-center rounded-lg border bg-background">
        <legend className="sr-only">Cantidad</legend>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Una unidad menos"
          disabled={cantidad <= 1}
          onClick={() => setCantidad((c) => Math.max(1, c - 1))}
        >
          <Minus />
        </Button>
        <span className="w-7 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {cantidad}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Una unidad más"
          disabled={cantidad >= 99}
          onClick={() => setCantidad((c) => Math.min(99, c + 1))}
        >
          <Plus />
        </Button>
      </fieldset>
      <BotonEnviar size="sm" className="flex-1" aria-label={`Agregar ${etiqueta} al carrito`}>
        <ShoppingCart data-icon="inline-start" /> Agregar
      </BotonEnviar>
    </form>
  );
}

/** Acceso al carrito con la cantidad de unidades (encabezado del portal). */
export function AccesoCarrito({ cantidad }: { cantidad: number }) {
  return (
    <Link
      href="/portal/carrito"
      className="relative inline-flex size-9 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-muted"
      aria-label={cantidad ? `Carrito: ${cantidad} unidades` : "Carrito vacío"}
    >
      <ShoppingCart className="size-4" />
      {cantidad > 0 && (
        <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[0.7rem] font-bold text-brand-foreground tabular-nums">
          {cantidad > 99 ? "99+" : cantidad}
        </span>
      )}
    </Link>
  );
}
