import type { Metadata } from "next";
import Link from "next/link";
import { FormularioRegistro } from "./formulario";

export const metadata: Metadata = { title: "Registrá tu empresa" };

export default function PaginaRegistro() {
  return (
    <div className="w-full max-w-2xl space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Paso 1 de 2</p>
        <h2 className="text-2xl font-semibold tracking-tight">Registrá tu empresa</h2>
        <p className="text-muted-foreground text-sm">
          Con estos datos armamos tu cuenta y la facturación. Después vas a poder sumar oficinas,
          usuarios y contratar paquetes.
        </p>
      </header>
      <FormularioRegistro />
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link
          href="/ingresar"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Ingresá
        </Link>
      </p>
    </div>
  );
}
