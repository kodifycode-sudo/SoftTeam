"use client";

import { Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { BotonEnviar, Campo, MensajeFormulario, useAvisoDeAccion } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  confirmarActivacionAccion,
  desactivarAccion,
  type EstadoDosFactores,
  iniciarActivacionAccion,
  regenerarCodigosAccion,
} from "./acciones";

const INICIAL: EstadoDosFactores = {};

/** Códigos de respaldo: se muestran una sola vez. */
function CodigosRespaldo({ codigos }: { codigos: string[] }) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigos.join("\n"));
      toast.success("Códigos copiados.");
    } catch {
      toast.error("No se pudieron copiar: anotalos a mano.");
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-warning/50 bg-warning/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Códigos de respaldo</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void copiar()}>
          <Copy data-icon="inline-start" /> Copiar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Guardalos en un lugar seguro (un gestor de contraseñas). Cada uno sirve una sola vez para
        entrar si no tenés el celular. No los vamos a volver a mostrar.
      </p>
      <ul aria-label="Códigos de respaldo" className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codigos.map((c) => (
          <li key={c} className="rounded-md bg-card px-2 py-1 text-center">
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CodigoApp({ estado }: { estado: EstadoDosFactores }) {
  const errores = estado.errores?.codigo;
  return (
    <Field data-invalid={errores ? true : undefined}>
      <FieldLabel>Código que muestra la app</FieldLabel>
      <InputOTP
        name="codigo"
        maxLength={6}
        inputMode="numeric"
        pattern="^\d+$"
        autoComplete="one-time-code"
        aria-label="Código de la app"
        aria-invalid={errores ? true : undefined}
      >
        <InputOTPGroup>
          {[0, 1, 2].map((i) => (
            <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {[3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}

/**
 * Verificación en dos pasos de la propia cuenta. Los estados de las acciones
 * viven acá (siempre montado): al activar o desactivar, la página cambia de
 * rama y el aviso igual tiene que mostrarse.
 */
export function DosFactores({ activo }: { activo: boolean }) {
  const [inicio, iniciar] = useActionState(iniciarActivacionAccion, INICIAL);
  // Cada intento fallido vacía el campo del código (se vuelve a montar).
  const [intentos, setIntentos] = useState(0);
  const [confirmacion, confirmar] = useActionState(
    async (previo: EstadoDosFactores, datos: FormData) => {
      const resultado = await confirmarActivacionAccion(previo, datos);
      if (!resultado.ok) setIntentos((n) => n + 1);
      return resultado;
    },
    INICIAL,
  );
  const [baja, desactivar] = useActionState(desactivarAccion, INICIAL);
  const [nuevos, regenerar] = useActionState(regenerarCodigosAccion, INICIAL);
  const [accion, setAccion] = useState<"desactivar" | "regenerar" | null>(null);
  const formularioActivar = useRef<HTMLFormElement>(null);
  useAvisoDeAccion(confirmacion);
  useAvisoDeAccion(baja, () => setAccion(null));

  if (activo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-5 text-success" /> Verificación en dos pasos
            <Badge className="bg-success/15 text-success">Activa</Badge>
          </CardTitle>
          <CardDescription>
            Al ingresar, además de la contraseña te pedimos el código de tu app de autenticación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {nuevos.ok && nuevos.codigos && <CodigosRespaldo codigos={nuevos.codigos} />}
          {accion === null ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setAccion("regenerar")}>
                <KeyRound data-icon="inline-start" /> Nuevos códigos de respaldo
              </Button>
              <Button variant="ghost" onClick={() => setAccion("desactivar")}>
                <ShieldOff data-icon="inline-start" /> Desactivar
              </Button>
            </div>
          ) : (
            <form
              action={accion === "desactivar" ? desactivar : regenerar}
              className="max-w-sm space-y-3"
              noValidate
            >
              <MensajeFormulario estado={accion === "desactivar" ? baja : nuevos} />
              <Campo
                nombre="password"
                etiqueta="Tu contraseña"
                type="password"
                autoComplete="current-password"
                estado={accion === "desactivar" ? baja : nuevos}
              />
              <p className="text-xs text-muted-foreground">
                {accion === "desactivar"
                  ? "Tu cuenta va a quedar protegida solo por la contraseña."
                  : "Los códigos de respaldo anteriores dejan de servir."}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setAccion(null)}>
                  Cancelar
                </Button>
                <BotonEnviar variant={accion === "desactivar" ? "destructive" : "default"}>
                  {accion === "desactivar" ? "Desactivar" : "Generar códigos"}
                </BotonEnviar>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ShieldOff className="size-5 text-muted-foreground" /> Verificación en dos pasos
          <Badge variant="outline">Desactivada</Badge>
        </CardTitle>
        <CardDescription>
          Con tu usuario se pueden ver y cambiar los datos de todos los clientes. Protegelo con un
          código de tu celular además de la contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!inicio.ok ? (
          <form action={iniciar} className="max-w-sm space-y-3" noValidate>
            <MensajeFormulario estado={inicio} />
            <Campo
              nombre="password"
              etiqueta="Tu contraseña"
              type="password"
              autoComplete="current-password"
              estado={inicio}
            />
            <BotonEnviar>
              <ShieldCheck data-icon="inline-start" /> Empezar a activarla
            </BotonEnviar>
          </form>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <ol className="space-y-4 text-sm">
              <li className="space-y-3">
                <p>
                  <strong>1.</strong> Escaneá el código con tu app de autenticación (Google
                  Authenticator, Microsoft Authenticator, 1Password…).
                </p>
                {inicio.qr && (
                  // biome-ignore lint/performance/noImgElement: QR generado en el servidor como data URL; next/image no aporta nada.
                  <img
                    src={inicio.qr}
                    alt="Código QR para la app de autenticación"
                    width={224}
                    height={224}
                    className="rounded-lg border bg-white p-2"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  ¿No podés escanearlo? Cargá esta clave a mano:
                </p>
                <code className="block font-mono text-sm break-all">{inicio.secreto}</code>
              </li>
              <li>
                <form ref={formularioActivar} action={confirmar} className="space-y-3" noValidate>
                  <p>
                    <strong>2.</strong> Escribí el código de 6 números que muestra la app.
                  </p>
                  <MensajeFormulario estado={confirmacion.ok ? {} : confirmacion} />
                  <CodigoApp key={intentos} estado={confirmacion} />
                  <BotonEnviar>Activar</BotonEnviar>
                </form>
              </li>
            </ol>
            {inicio.codigos && <CodigosRespaldo codigos={inicio.codigos} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
