import { Info, MailCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormularioVerificacion } from "./formulario";

export const metadata: Metadata = { title: "Confirmá tu mail" };

export default async function PaginaVerificar({ searchParams }: PageProps<"/registro/verificar">) {
  const { email, envio, aviso } = await searchParams;
  if (typeof email !== "string" || !email.includes("@")) redirect("/registro");
  const fallo = envio === "fallo";
  return (
    <div className="w-full max-w-sm space-y-8">
      <header className="space-y-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand/20 text-brand-foreground">
          <MailCheck className="size-6" />
        </span>
        <p className="text-sm font-medium text-primary">Último paso</p>
        <h2 className="text-2xl font-semibold tracking-tight">Confirmá tu mail</h2>
        <p className="text-muted-foreground text-sm">
          {fallo ? "Te vamos a enviar" : "Te enviamos"} un código de 6 números a{" "}
          <strong className="text-foreground">{email}</strong>. Vence en 10 minutos.
        </p>
        {aviso === "pendiente" && (
          <Alert>
            <Info />
            <AlertDescription>
              Ya habías empezado el registro con este mail: actualizamos los datos con los que
              acabás de cargar. Confirmá el mail para activar la cuenta.
            </AlertDescription>
          </Alert>
        )}
      </header>
      <FormularioVerificacion email={email} envioFallido={fallo} />
    </div>
  );
}
