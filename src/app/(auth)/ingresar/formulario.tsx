"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/formulario";
import { FieldGroup } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { ingresar } from "../acciones";

export function FormularioIngreso({ destino, email }: { destino?: string; email?: string }) {
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
          defaultValue={email}
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
        <Link
          href="/recuperar"
          className="-mt-3 self-end text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </FieldGroup>
      <BotonEnviar size="lg" className="w-full">
        <LogIn data-icon="inline-start" /> Ingresar
      </BotonEnviar>
    </form>
  );
}
