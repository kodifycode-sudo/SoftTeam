import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioCambiarContrasena } from "./formulario";

export const metadata: Metadata = { title: "Elegí tu contraseña" };

export default async function PaginaCambiar({ searchParams }: PageProps<"/recuperar/cambiar">) {
  const { email, invitacion } = await searchParams;
  if (typeof email !== "string" || !email.includes("@")) redirect("/recuperar");
  return (
    <div className="w-full max-w-sm space-y-8">
      <header className="space-y-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand/20 text-brand-foreground">
          <KeyRound className="size-6" />
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">
          {invitacion === "1" ? "Elegí tu contraseña" : "Elegí una contraseña nueva"}
        </h2>
        <p className="text-muted-foreground text-sm">
          Si <strong className="text-foreground">{email}</strong> tiene una cuenta, le enviamos un
          código de 6 números. Vence en 10 minutos.
        </p>
      </header>
      <FormularioCambiarContrasena email={email} />
    </div>
  );
}
