"use client";

import { Check } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/formulario";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { cambiarContrasena } from "../../acciones";

export function FormularioCambiarContrasena({ email }: { email: string }) {
  const [estado, accion] = useActionState(cambiarContrasena, ESTADO_INICIAL);
  const errores = estado.errores?.codigo;
  // Controlado: tras un código rechazado se vacía para volver a escribirlo.
  const [codigo, setCodigo] = useState("");
  useEffect(() => {
    if (estado.errores?.codigo) setCodigo("");
  }, [estado]);
  return (
    <form action={accion} className="space-y-6" noValidate>
      <input type="hidden" name="email" value={email} />
      <MensajeFormulario estado={estado} />
      <FieldGroup>
        <Field data-invalid={errores ? true : undefined}>
          <FieldLabel htmlFor="codigo">Código</FieldLabel>
          <InputOTP
            id="codigo"
            name="codigo"
            value={codigo}
            onChange={setCodigo}
            maxLength={6}
            inputMode="numeric"
            pattern="^\d+$"
            autoFocus
            autoComplete="one-time-code"
            aria-invalid={errores ? true : undefined}
            containerClassName="justify-center sm:justify-start"
          >
            <InputOTPGroup>
              {[0, 1, 2].map((i) => (
                <InputOTPSlot key={i} index={i} className="size-12 text-lg" />
              ))}
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              {[3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="size-12 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <FieldError errors={errores?.map((message) => ({ message }))} />
        </Field>
        <Campo
          nombre="password"
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          ayuda="Al menos 10 caracteres, con mayúscula, minúscula y número."
          estado={{ ...estado, valores: {} }}
        />
        <Campo
          nombre="confirmacion"
          etiqueta="Repetí la contraseña"
          type="password"
          autoComplete="new-password"
          estado={{ ...estado, valores: {} }}
        />
      </FieldGroup>
      <BotonEnviar size="lg" className="w-full">
        <Check data-icon="inline-start" /> Guardar contraseña
      </BotonEnviar>
    </form>
  );
}
