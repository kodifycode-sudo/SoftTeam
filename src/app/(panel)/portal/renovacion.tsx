"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { useAvisoDeAccion } from "@/components/formulario";
import { Switch } from "@/components/ui/switch";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { cambiarRenovacionAccion } from "./acciones";

/** Interruptor "Renovación automática" de un paquete: guarda al instante. */
export function InterruptorRenovacion({
  contratoId,
  paquete,
  renovar,
}: {
  contratoId: string;
  paquete: string;
  renovar: boolean;
}) {
  const [estado, accion] = useActionState(cambiarRenovacionAccion, ESTADO_INICIAL);
  const [mostrado, mostrar] = useOptimistic(renovar);
  const [enviando, iniciar] = useTransition();
  useAvisoDeAccion(estado);
  const id = `renovar-${contratoId}`;
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch
        id={id}
        size="sm"
        checked={mostrado}
        disabled={enviando}
        aria-label={`Renovación automática de ${paquete}`}
        onCheckedChange={(nuevo) => {
          const datos = new FormData();
          datos.set("contratoId", contratoId);
          datos.set("renovar", String(nuevo));
          iniciar(() => {
            mostrar(nuevo);
            accion(datos);
          });
        }}
      />
      Renovación automática
    </label>
  );
}
