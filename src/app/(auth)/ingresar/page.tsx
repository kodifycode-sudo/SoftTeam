import { CircleCheck, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };

export default async function PaginaIngresar({ searchParams }: PageProps<"/ingresar">) {
  const { destino, aviso, email } = await searchParams;
  return (
    <div className="w-full max-w-sm space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Ingresá a tu cuenta</h2>
        <p className="text-muted-foreground text-sm">
          Administrá tus licencias, pagos y usuarios de los productos SOFTeam.
        </p>
      </header>
      {aviso === "contrasena" && (
        <Alert className="border-success/30 bg-success/5 text-success">
          <CircleCheck />
          <AlertDescription className="text-success">
            Listo, guardamos tu contraseña. Ya podés ingresar.
          </AlertDescription>
        </Alert>
      )}
      {aviso === "codigo-vencido" && (
        <Alert>
          <Clock />
          <AlertDescription>
            Pasaron más de 10 minutos. Por seguridad, volvé a ingresar tu contraseña.
          </AlertDescription>
        </Alert>
      )}
      <FormularioIngreso
        destino={typeof destino === "string" ? destino : undefined}
        email={typeof email === "string" ? email : undefined}
      />
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
