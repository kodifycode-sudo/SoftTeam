"use client";

import { Send } from "lucide-react";
import { useActionState } from "react";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/formulario";
import { FieldGroup } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { pedirCodigoContrasena } from "../acciones";

export function FormularioPedirCodigo({
  email,
  invitacion,
}: {
  email: string;
  invitacion: boolean;
}) {
  const [estado, accion] = useActionState(pedirCodigoContrasena, ESTADO_INICIAL);
  return (
    <form action={accion} className="space-y-6" noValidate>
      {invitacion && <input type="hidden" name="invitacion" value="1" />}
      <MensajeFormulario estado={estado} />
      <FieldGroup>
        <Campo
          nombre="email"
          etiqueta="Mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={email}
          required
          estado={estado}
        />
      </FieldGroup>
      <BotonEnviar size="lg" className="w-full">
        <Send data-icon="inline-start" /> Enviarme el código
      </BotonEnviar>
    </form>
  );
}
