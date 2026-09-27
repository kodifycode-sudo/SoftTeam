"use client";

import { KeyRound, Smartphone } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { BotonEnviar, Casilla, MensajeFormulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { verificarSegundoFactor } from "../../acciones";

export function FormularioSegundoFactor({ destino }: { destino?: string | undefined }) {
  // Cada intento fallido vacía el campo del código (se vuelve a montar).
  const [intentos, setIntentos] = useState(0);
  const [estado, verificar] = useActionState(async (previo: EstadoFormulario, datos: FormData) => {
    const resultado = await verificarSegundoFactor(previo, datos);
    setIntentos((n) => n + 1);
    return resultado;
  }, ESTADO_INICIAL);
  const [respaldo, setRespaldo] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const errores = estado.errores?.codigo;

  return (
    <div className="space-y-6">
      <form ref={formulario} action={verificar} className="space-y-6" noValidate>
        <input type="hidden" name="tipo" value={respaldo ? "respaldo" : "app"} />
        {destino && <input type="hidden" name="destino" value={destino} />}
        <MensajeFormulario estado={estado} />
        {respaldo ? (
          <Field data-invalid={errores ? true : undefined}>
            <FieldLabel htmlFor="codigo">Código de respaldo</FieldLabel>
            <Input
              key={intentos}
              id="codigo"
              name="codigo"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              className="font-mono"
              aria-invalid={errores ? true : undefined}
            />
            <FieldError errors={errores?.map((message) => ({ message }))} />
          </Field>
        ) : (
          <Field data-invalid={errores ? true : undefined}>
            <InputOTP
              key={intentos}
              name="codigo"
              maxLength={6}
              inputMode="numeric"
              pattern="^\d+$"
              autoFocus
              autoComplete="one-time-code"
              aria-label="Código de la app"
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
        )}
        <Casilla
          nombre="confiar"
          etiqueta="Confiar en este dispositivo"
          descripcion="No te lo pedimos por 30 días en este navegador. No lo marques en una computadora compartida."
          marcada={false}
        />
        <BotonEnviar size="lg" className="w-full">
          Verificar y entrar
        </BotonEnviar>
      </form>
      <div className="flex flex-col items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => setRespaldo(!respaldo)}>
          {respaldo ? (
            <>
              <Smartphone data-icon="inline-start" /> Usar el código de la app
            </>
          ) : (
            <>
              <KeyRound data-icon="inline-start" /> No tengo el celular: usar un código de respaldo
            </>
          )}
        </Button>
        <Link href="/ingresar" className="text-sm text-muted-foreground hover:underline">
          Volver a ingresar
        </Link>
      </div>
    </div>
  );
}
