"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { SelectNativo } from "@/components/select-nativo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
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
  // Un id propio cuando el mismo nombre de campo se repite en la página.
  const id = input.id ?? `campo-${nombre}`;
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

/**
 * Muestra el resultado de una acción como aviso (éxito o error general) y,
 * si salió bien, ejecuta `alTerminar` (por ejemplo, cerrar un diálogo). Los
 * errores por campo se muestran en el formulario, no como aviso.
 */
export function useAvisoDeAccion(estado: EstadoFormulario, alTerminar?: () => void) {
  const avisar = useEffectEvent((e: EstadoFormulario) => {
    if (!e.mensaje) return;
    if (e.ok) {
      toast.success(e.mensaje);
      alTerminar?.();
    } else if (!e.errores) {
      toast.error(e.mensaje);
    }
  });
  useEffect(() => {
    avisar(estado);
  }, [estado]);
}

/**
 * Casilla de verificación con etiqueta y ayuda. Envía "on" si está marcada.
 * Una casilla deshabilitada no viaja en el formulario: si está marcada, se
 * envía su valor en un campo oculto para que el servidor no la lea como
 * desmarcada.
 */
export function Casilla({
  nombre,
  etiqueta,
  descripcion,
  marcada,
  deshabilitada,
}: {
  nombre: string;
  etiqueta: ReactNode;
  descripcion?: ReactNode;
  marcada: boolean;
  deshabilitada?: boolean;
}) {
  const id = `casilla-${nombre}`;
  return (
    <Field orientation="horizontal" data-disabled={deshabilitada ? true : undefined}>
      <Checkbox
        // Si el valor guardado cambia (revalidación tras guardar), se remonta
        // con el nuevo valor inicial en lugar de cambiar el de una casilla viva.
        key={String(marcada)}
        id={id}
        name={nombre}
        value="on"
        defaultChecked={marcada}
        disabled={deshabilitada}
      />
      {deshabilitada && marcada && <input type="hidden" name={nombre} value="on" />}
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-normal">
          {etiqueta}
        </FieldLabel>
        {descripcion && <FieldDescription>{descripcion}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}

/** Lista desplegable nativa con etiqueta y errores del servidor; conserva lo elegido. */
export function Selector({
  nombre,
  etiqueta,
  ayuda,
  estado,
  valorInicial,
  children,
}: {
  nombre: string;
  etiqueta: string;
  ayuda?: ReactNode;
  estado: EstadoFormulario;
  valorInicial: string;
  children: ReactNode;
}) {
  const errores = estado.errores?.[nombre];
  const id = `campo-${nombre}`;
  const valor = estado.valores?.[nombre] ?? valorInicial;
  return (
    <Field data-invalid={errores ? true : undefined}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      <SelectNativo
        key={valor}
        id={id}
        name={nombre}
        defaultValue={valor}
        aria-invalid={errores ? true : undefined}
      >
        {children}
      </SelectNativo>
      {ayuda && <FieldDescription>{ayuda}</FieldDescription>}
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}
