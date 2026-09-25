"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { EstadoFormulario } from "@/lib/formulario";

/** Campo de texto con etiqueta, ayuda y errores del servidor. */
export function Campo({
  nombre,
  etiqueta,
  ayuda,
  estado,
  className,
  ...input
}: {
  nombre: string;
  etiqueta: string;
  ayuda?: ReactNode;
  estado: EstadoFormulario;
} & Omit<ComponentProps<typeof Input>, "name">) {
  const errores = estado.errores?.[nombre];
  const id = `campo-${nombre}`;
  return (
    <Field data-invalid={errores ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <Input
        id={id}
        name={nombre}
        aria-invalid={errores ? true : undefined}
        defaultValue={estado.valores?.[nombre] ?? input.defaultValue}
        {...input}
      />
      {ayuda && !errores && <FieldDescription>{ayuda}</FieldDescription>}
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}

/** Botón de envío que se deshabilita y muestra actividad mientras la acción corre. */
export function BotonEnviar({ children, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Spinner data-icon="inline-start" />}
      {children}
    </Button>
  );
}

/** Mensaje general del formulario (éxito o error). */
export function MensajeFormulario({ estado }: { estado: EstadoFormulario }) {
  if (!estado.mensaje) return null;
  const exito = estado.ok === true;
  return (
    <Alert
      variant={exito ? "default" : "destructive"}
      className={exito ? "border-success/30 bg-success/5 text-success" : undefined}
    >
      {exito ? <CircleCheck /> : <CircleAlert />}
      <AlertDescription className={exito ? "text-success" : undefined}>
        {estado.mensaje}
      </AlertDescription>
    </Alert>
  );
}
