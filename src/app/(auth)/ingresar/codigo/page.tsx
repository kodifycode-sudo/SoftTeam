import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { FormularioSegundoFactor } from "./formulario";

export const metadata: Metadata = { title: "Código de seguridad" };

export default async function PaginaSegundoFactor({ searchParams }: PageProps<"/ingresar/codigo">) {
  const { destino } = await searchParams;
  return (
    <div className="w-full max-w-sm space-y-8">
      <header className="space-y-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand/20 text-brand-foreground">
          <ShieldCheck className="size-6" />
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">Código de seguridad</h2>
        <p className="text-muted-foreground text-sm">
          Abrí tu app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…) y
          escribí el código de 6 números de STLic.
        </p>
      </header>
      <FormularioSegundoFactor destino={typeof destino === "string" ? destino : undefined} />
    </div>
  );
}
