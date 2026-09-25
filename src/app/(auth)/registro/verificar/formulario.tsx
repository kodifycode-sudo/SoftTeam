"use client";

import { RotateCw } from "lucide-react";
import { useActionState, useRef } from "react";
import { BotonEnviar, MensajeFormulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { reenviarCodigo, verificarCodigo } from "../../acciones";

export function FormularioVerificacion({ email }: { email: string }) {
  const [estado, verificar] = useActionState(verificarCodigo, ESTADO_INICIAL);
  const [estadoReenvio, reenviar, reenviando] = useActionState(reenviarCodigo, ESTADO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const errores = estado.errores?.codigo;

  return (
    <div className="space-y-6">
      <form ref={formulario} action={verificar} className="space-y-6">
        <input type="hidden" name="email" value={email} />
        <MensajeFormulario estado={estado} />
        <MensajeFormulario estado={estadoReenvio} />
        <Field data-invalid={errores ? true : undefined}>
          <InputOTP
            name="codigo"
            maxLength={6}
            inputMode="numeric"
            pattern="^\d+$"
            autoFocus
            autoComplete="one-time-code"
            aria-label="Código de verificación"
            aria-invalid={errores ? true : undefined}
            onComplete={() => formulario.current?.requestSubmit()}
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
        <BotonEnviar size="lg" className="w-full">
          Confirmar y entrar
        </BotonEnviar>
      </form>
      <form action={reenviar} className="text-center">
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="ghost" size="sm" disabled={reenviando}>
          <RotateCw data-icon="inline-start" className={reenviando ? "animate-spin" : undefined} />
          No me llegó, enviar otro código
        </Button>
      </form>
    </div>
  );
}
