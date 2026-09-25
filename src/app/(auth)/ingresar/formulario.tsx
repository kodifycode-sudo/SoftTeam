"use client";

import { LogIn } from "lucide-react";
import { useActionState } from "react";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/formulario";
import { FieldGroup } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { ingresar } from "../acciones";

export function FormularioIngreso({ destino }: { destino?: string }) {
  const [estado, accion] = useActionState(ingresar, ESTADO_INICIAL);
  return (
    <form action={accion} className="space-y-6" noValidate>
      {destino && <input type="hidden" name="destino" value={destino} />}
      <MensajeFormulario estado={estado} />
      <FieldGroup>
        <Campo
          nombre="email"
          etiqueta="Mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="nombre@tubroker.com.ar"
          required
          estado={estado}
        />
        <Campo
          nombre="password"
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          estado={estado}
        />
      </FieldGroup>
      <BotonEnviar size="lg" className="w-full">
        <LogIn data-icon="inline-start" /> Ingresar
      </BotonEnviar>
    </form>
  );
}
