import type { Metadata } from "next";
import Link from "next/link";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };

export default async function PaginaIngresar({ searchParams }: PageProps<"/ingresar">) {
  const { destino } = await searchParams;
  return (
    <div className="w-full max-w-sm space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Ingresá a tu cuenta</h2>
        <p className="text-muted-foreground text-sm">
          Administrá tus licencias, pagos y usuarios de los productos SOFTeam.
        </p>
      </header>
      <FormularioIngreso destino={typeof destino === "string" ? destino : undefined} />
      <p className="text-center text-sm text-muted-foreground">
        ¿Todavía no tenés cuenta?{" "}
        <Link
          href="/registro"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Registrá tu empresa
        </Link>
      </p>
    </div>
  );
}
