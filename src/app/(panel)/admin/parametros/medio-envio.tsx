"use client";

import { useActionState } from "react";
import {
  BotonEnviar,
  Campo,
  Casilla,
  FormularioConservado,
  useAvisoDeAccion,
} from "@/components/formulario";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { guardarMedioEnvioAccion } from "./acciones";

/** Factor (créditos por envío) y estado de un medio de envío. */
export function FormularioMedioEnvio({
  id,
  nombre,
  factor,
  activo,
  editable,
  porDefecto,
}: {
  id: string;
  nombre: string;
  factor: string;
  activo: boolean;
  editable: boolean;
  porDefecto: boolean;
}) {
  const [estado, accion] = useActionState(guardarMedioEnvioAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  return (
    <FormularioConservado
      accion={accion}
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-end"
      noValidate
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex-1">
        <Campo
          id={`medio-${id}`}
          nombre="factor"
          etiqueta={`${nombre} (créditos por envío)`}
          defaultValue={factor}
          inputMode="decimal"
          readOnly={!editable}
          estado={estado.ok ? ESTADO_INICIAL : estado}
        />
      </div>
      <div className="sm:pb-2">
        <Casilla
          id={`medio-${id}-activo`}
          nombre="activo"
          etiqueta="Activo"
          marcada={activo}
          deshabilitada={!editable || porDefecto}
        />
        {porDefecto && <input type="hidden" name="activo" value="on" />}
      </div>
      {editable && (
        <BotonEnviar variant="outline" aria-label={`Guardar ${nombre}`}>
          Guardar
        </BotonEnviar>
      )}
    </FormularioConservado>
  );
}
