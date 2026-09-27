"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";
import { BotonEnviar, MensajeFormulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { cn } from "@/lib/utils";
import { agregarRenovacionAccion } from "./acciones";

export interface OpcionRenovacion {
  id: string;
  nombre: string;
  meses: number | null;
  /** Precio de renovación ya formateado, por la cantidad que se renueva. */
  precio: string;
}

function Contenido({
  contratoId,
  alternativaActual,
  opciones,
  desde,
}: {
  contratoId: string;
  alternativaActual: string;
  opciones: OpcionRenovacion[];
  desde: string;
}) {
  const [estado, accion] = useActionState(agregarRenovacionAccion, ESTADO_INICIAL);
  const inicial = opciones.some((o) => o.id === alternativaActual)
    ? alternativaActual
    : opciones[0]?.id;
  const [elegida, setElegida] = useState(inicial);
  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="contratoId" value={contratoId} />
      <MensajeFormulario estado={estado} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">¿Por cuánto tiempo?</legend>
        {opciones.map((o) => (
          <label
            key={o.id}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors hover:bg-muted/50",
              elegida === o.id && "border-primary bg-primary/5 ring-1 ring-primary/30",
            )}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="alternativaId"
                value={o.id}
                checked={elegida === o.id}
                onChange={() => setElegida(o.id)}
                className="accent-primary"
              />
              <span>
                <span className="font-medium">{o.nombre}</span>
                {o.id === alternativaActual && (
                  <span className="text-xs text-muted-foreground"> · la que tenés hoy</span>
                )}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">{o.precio}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        El nuevo período empieza el {desde}, cuando termina el actual: no perdés días por renovar
        antes. Se suma al carrito para que elijas cómo pagar.
      </p>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Agregar al carrito</BotonEnviar>
      </DialogFooter>
    </form>
  );
}

/** Renovar un paquete vigente a mano (antes de la renovación automática, o con otra duración). */
export function RenovarPaquete({
  paquete,
  ...props
}: {
  paquete: string;
  contratoId: string;
  alternativaActual: string;
  opciones: OpcionRenovacion[];
  desde: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" aria-label={`Renovar ${paquete}`} />}
      >
        <RefreshCw data-icon="inline-start" /> Renovar
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renovar {paquete}</DialogTitle>
          <DialogDescription>
            Elegí la duración. Podés pasar, por ejemplo, de mensual a anual.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido {...props} />}
      </DialogContent>
    </Dialog>
  );
}
