"use client";

import { House, RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Error dentro de una sección del panel: se muestra en lugar del contenido,
 * pero la barra lateral y el encabezado siguen funcionando.
 */
export function ErrorSeccion({
  error,
  retry,
  inicio,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  /** Página de inicio de la sección ("/admin", "/portal"). */
  inicio: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center sm:py-24"
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-7" />
      </span>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">No pudimos mostrar esta página</h1>
        <p className="text-pretty text-muted-foreground">
          Tuvimos un problema al cargar la información. Puede ser algo pasajero: probá de nuevo en
          un momento.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">
            Código de referencia: {error.digest}
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCw /> Reintentar
        </Button>
        <Link href={inicio} className={buttonVariants({ variant: "outline" })}>
          <House /> Ir al inicio
        </Link>
      </div>
    </div>
  );
}
