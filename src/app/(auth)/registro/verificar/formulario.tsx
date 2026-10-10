"use client";

import { MailX, RotateCw } from "lucide-react";
import { useActionState, useRef } from "react";
import { BotonEnviar, MensajeFormulario } from "@/components/formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export function FormularioVerificacion({
  email,
  envioFallido,
}: {
  email: string;
  /** El mail con el código no se pudo enviar al registrarse. */
  envioFallido: boolean;
}) {
  const [estado, verificar] = useActionState(verificarCodigo, ESTADO_INICIAL);
  const [estadoReenvio, reenviar, reenviando] = useActionState(reenviarCodigo, ESTADO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  const errores = estado.errores?.codigo;
  // Hasta que un reintento salga bien, el reenvío es la acción principal.
  const sinCodigo = envioFallido && !estadoReenvio.ok;

  return (
    <div className="space-y-6">
      {sinCodigo && (
        <Alert variant="destructive">
          <MailX />
          <AlertTitle>No pudimos enviarte el mail</AlertTitle>
          <AlertDescription>
            Tu cuenta quedó creada, pero el mail con el código no salió. Revisá que el mail esté
            bien escrito y tocá "Reintentar el envío".
          </AlertDescription>
        </Alert>
      )}
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
          Confirmar
        </BotonEnviar>
      </form>
      <form action={reenviar} className="text-center">
        <input type="hidden" name="email" value={email} />
        <Button
          type="submit"
          variant={sinCodigo ? "default" : "ghost"}
          size={sinCodigo ? "lg" : "sm"}
          className={sinCodigo ? "w-full" : undefined}
          disabled={reenviando}
        >
          <RotateCw data-icon="inline-start" className={reenviando ? "animate-spin" : undefined} />
          {sinCodigo ? "Reintentar el envío" : "No me llegó, enviar otro código"}
        </Button>
      </form>
    </div>
  );
}
