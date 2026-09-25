"use client";

import { TriangleAlert } from "lucide-react";
import { EstadoPagina } from "@/components/estado-pagina";
import { Button } from "@/components/ui/button";

export default function ErrorGeneral({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <EstadoPagina
      icono={TriangleAlert}
      titulo="Algo salió mal"
      texto={
        <>
          Tuvimos un problema al procesar tu pedido. Probá de nuevo en un momento.
          {error.digest && (
            <span className="mt-2 block font-mono text-xs">
              Código de referencia: {error.digest}
            </span>
          )}
        </>
      }
      acciones={<Button onClick={reset}>Reintentar</Button>}
    />
  );
}
