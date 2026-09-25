import { KeyRound, UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FormularioPedirCodigo } from "./formulario";

export const metadata: Metadata = { title: "Recuperar la contraseña" };

export default async function PaginaRecuperar({ searchParams }: PageProps<"/recuperar">) {
  const { email, invitacion } = await searchParams;
  const esInvitacion = invitacion === "1";
  const Icono = esInvitacion ? UserRoundCheck : KeyRound;
  return (
    <div className="w-full max-w-sm space-y-8">
      <header className="space-y-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand/20 text-brand-foreground">
          <Icono className="size-6" />
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">
          {esInvitacion ? "Activá tu acceso" : "¿Olvidaste tu contraseña?"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {esInvitacion
            ? "Te enviamos un código a tu mail para que elijas tu contraseña."
            : "Te enviamos un código a tu mail para que elijas una contraseña nueva."}
        </p>
      </header>
      <FormularioPedirCodigo
        email={typeof email === "string" ? email : ""}
        invitacion={esInvitacion}
      />
      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/ingresar"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Volver a ingresar
        </Link>
      </p>
    </div>
  );
}
