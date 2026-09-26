"use client";

import { Send } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { BotonEnviar, useAvisoDeAccion } from "@/components/formulario";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";

/**
 * Formulario para responder un pedido de soporte. La acción la define cada
 * panel (cliente o SOFTeam); SOFTeam puede además dejar notas internas.
 */
export function ResponderIncidente({
  incidenteId,
  accion,
  permitirInterno = false,
}: {
  incidenteId: string;
  accion: (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;
  permitirInterno?: boolean;
}) {
  const [estado, enviar] = useActionState(accion, ESTADO_INICIAL);
  // Tras enviar, el formulario queda limpio para el próximo mensaje.
  const [version, setVersion] = useState(0);
  useAvisoDeAccion(estado);
  useEffect(() => {
    if (estado.ok) setVersion((v) => v + 1);
  }, [estado]);
  const errores = estado.errores?.texto;

  return (
    <form action={enviar} key={version} className="space-y-3">
      <input type="hidden" name="incidenteId" value={incidenteId} />
      <Field data-invalid={errores ? true : undefined}>
        <FieldLabel htmlFor="texto">Tu respuesta</FieldLabel>
        <Textarea
          id="texto"
          name="texto"
          rows={4}
          maxLength={5000}
          defaultValue={estado.ok ? "" : (estado.valores?.texto ?? "")}
          placeholder="Escribí tu mensaje…"
          aria-invalid={errores ? true : undefined}
        />
        <FieldError errors={errores?.map((message) => ({ message }))} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {permitirInterno ? (
          <Field orientation="horizontal" className="w-auto">
            <Checkbox id="interno" name="interno" value="on" />
            <FieldLabel htmlFor="interno" className="font-normal">
              Nota interna (el cliente no la ve)
            </FieldLabel>
          </Field>
        ) : (
          <span />
        )}
        <BotonEnviar>
          <Send data-icon="inline-start" /> Enviar
        </BotonEnviar>
      </div>
    </form>
  );
}
