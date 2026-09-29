"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Bloque de código con botón para copiarlo. */
export function Codigo({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/50">
      <div className="flex justify-end border-b bg-muted/60 px-1 py-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Copiar ${etiqueta}`}
          onClick={async () => {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          {copiado ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">{texto}</pre>
    </div>
  );
}
