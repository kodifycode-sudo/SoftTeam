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
import { guardarParametroAccion } from "./acciones";

/** Un parámetro editable: lista de números, número o sí/no. */
export function FormularioParametro({
  clave,
  etiqueta,
  ayuda,
  tipo,
  valor,
  editable,
}: {
  clave: string;
  etiqueta: string;
  ayuda: string;
  tipo: "lista" | "numero" | "booleano";
  /** Valor actual como texto ("5, 15") o booleano. */
  valor: string | boolean;
  editable: boolean;
}) {
  const [estado, accion] = useActionState(guardarParametroAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  return (
    <FormularioConservado
      accion={accion}
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-end"
      noValidate
    >
      <input type="hidden" name="clave" value={clave} />
      <div className="flex-1">
        {tipo === "booleano" ? (
          <Casilla
            nombre="valor"
            etiqueta={etiqueta}
            descripcion={ayuda}
            marcada={valor === true}
            deshabilitada={!editable}
          />
        ) : (
          <Campo
            id={`parametro-${clave}`}
            nombre="valor"
            etiqueta={etiqueta}
            ayuda={ayuda}
            defaultValue={String(valor)}
            inputMode={tipo === "numero" ? "numeric" : "text"}
            readOnly={!editable}
            estado={estado.ok ? ESTADO_INICIAL : estado}
          />
        )}
      </div>
      {editable && (
        <BotonEnviar variant="outline" aria-label={`Guardar ${etiqueta}`}>
          Guardar
        </BotonEnviar>
      )}
    </FormularioConservado>
  );
}
