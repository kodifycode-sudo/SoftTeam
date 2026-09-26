"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { BotonEnviar, useAvisoDeAccion } from "@/components/formulario";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { guardarNotasAccion } from "./acciones";

export function NotasEmpresa({
  empresaId,
  clienteId,
  notas,
}: {
  empresaId: string;
  clienteId: string;
  notas: string;
}) {
  const [estado, accion] = useActionState(guardarNotasAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  const id = `notas-${empresaId}`;
  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="empresaId" value={empresaId} />
      <input type="hidden" name="clienteId" value={clienteId} />
      <Field>
        <FieldLabel htmlFor={id}>Notas de SOFTeam</FieldLabel>
        <Textarea id={id} name="notas" rows={4} maxLength={5000} defaultValue={notas} key={notas} />
        <FieldDescription>
          El cliente las ve en "Mi empresa", salvo las líneas que empiezan con *.
        </FieldDescription>
      </Field>
      <div className="flex justify-end">
        <BotonEnviar variant="outline" size="sm">
          <Save data-icon="inline-start" /> Guardar notas
        </BotonEnviar>
      </div>
    </form>
  );
}
