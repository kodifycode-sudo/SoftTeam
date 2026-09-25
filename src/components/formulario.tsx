"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { EstadoFormulario } from "@/lib/formulario";

const EnvioEnCurso = createContext(false);

/**
 * Formulario que conserva lo tipeado. Con `<form action>`, React reinicia los
 * campos al terminar la acción aunque haya errores; en formularios largos eso
 * obliga a cargar todo de nuevo. Este envía la misma acción (con
 * `useActionState`) desde `onSubmit`, sin reinicio.
 */
export function FormularioConservado({
  accion,
  children,
  ...props
}: { accion: (datos: FormData) => void } & Omit<ComponentProps<"form">, "action" | "onSubmit">) {
  const [enviando, iniciar] = useTransition();
  return (
    <EnvioEnCurso.Provider value={enviando}>
      <form
        {...props}
        onSubmit={(evento) => {
          evento.preventDefault();
          const datos = new FormData(evento.currentTarget);
          iniciar(() => accion(datos));
        }}
      >
        {children}
      </form>
    </EnvioEnCurso.Provider>
  );
}

/** Campo de texto con etiqueta, ayuda y errores del servidor. */
export function Campo({
  nombre,
  etiqueta,
  ayuda,
  estado,
  className,
  defaultValue,
  ...input
}: {
  nombre: string;
  etiqueta: string;
  ayuda?: ReactNode;
  estado: EstadoFormulario;
} & Omit<ComponentProps<typeof Input>, "name">) {
  const errores = estado.errores?.[nombre];
  const id = `campo-${nombre}`;
  // En formularios con `<form action>`, React reinicia los campos tras el
  // envío: el campo se remonta (key) con lo tipeado como valor inicial. Los
  // campos controlados (con `value`) no lo necesitan.
  const controlado = input.value !== undefined;
  const valorInicial = estado.valores?.[nombre] ?? defaultValue ?? "";
  return (
    <Field data-invalid={errores ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <Input
        key={controlado ? undefined : String(valorInicial)}
        id={id}
        name={nombre}
        aria-invalid={errores ? true : undefined}
        defaultValue={controlado ? undefined : valorInicial}
        {...input}
      />
      {ayuda && !errores && <FieldDescription>{ayuda}</FieldDescription>}
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}

/** Botón de envío que se deshabilita y muestra actividad mientras la acción corre. */
export function BotonEnviar({ children, disabled, ...props }: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  const enCurso = useContext(EnvioEnCurso);
  const enviando = pending || enCurso;
  return (
    <Button type="submit" {...props} disabled={enviando || disabled}>
      {enviando && <Spinner data-icon="inline-start" />}
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
