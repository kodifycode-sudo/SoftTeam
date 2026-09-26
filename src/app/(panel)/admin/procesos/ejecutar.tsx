"use client";

import { Play } from "lucide-react";
import { useActionState } from "react";
import { BotonEnviar, useAvisoDeAccion } from "@/components/formulario";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { ejecutarProcesosAccion } from "./acciones";

export function EjecutarProcesos() {
  const [estado, accion] = useActionState(
    async (_: EstadoFormulario) => ejecutarProcesosAccion(),
    ESTADO_INICIAL,
  );
  useAvisoDeAccion(estado);
  return (
    <form action={accion}>
      <BotonEnviar size="lg">
        <Play data-icon="inline-start" /> Ejecutar ahora
      </BotonEnviar>
    </form>
  );
}
