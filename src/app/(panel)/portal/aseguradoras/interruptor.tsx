"use client";

import { useActionState, useOptimistic, useTransition } from "react";
import { useAvisoDeAccion } from "@/components/formulario";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { cambiarAseguradoraAccion } from "./acciones";

/**
 * Interruptor que guarda al instante. Muestra el cambio en el acto y, si el
 * servidor lo rechaza (por ejemplo, por el límite de la licencia), vuelve al
 * estado anterior y avisa por qué.
 */
export function InterruptorAseguradora({
  aseguradoraId,
  cambio,
  valor,
  etiqueta,
  ayuda,
  deshabilitado,
}: {
  aseguradoraId: string;
  cambio: "trabaja" | "prodigal" | "cotiweb";
  valor: boolean;
  etiqueta: string;
  ayuda?: string;
  deshabilitado?: boolean;
}) {
  const [estado, accion] = useActionState(cambiarAseguradoraAccion, ESTADO_INICIAL);
  const [mostrado, mostrar] = useOptimistic(valor);
  const [enviando, iniciar] = useTransition();
  useAvisoDeAccion(estado);
  const id = `${cambio}-${aseguradoraId}`;

  return (
    <Field orientation="horizontal" data-disabled={deshabilitado ? true : undefined}>
      <Switch
        id={id}
        checked={mostrado}
        disabled={deshabilitado || enviando}
        onCheckedChange={(nuevo) => {
          const datos = new FormData();
          datos.set("aseguradoraId", aseguradoraId);
          datos.set("cambio", cambio);
          datos.set("valor", String(nuevo));
          iniciar(() => {
            mostrar(nuevo);
            accion(datos);
          });
        }}
      />
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-normal">
          {etiqueta}
        </FieldLabel>
        {ayuda && <FieldDescription className="text-xs">{ayuda}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}
