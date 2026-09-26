"use client";

import { FileText, Send } from "lucide-react";
import { useActionState } from "react";
import { BotonEnviar, useAvisoDeAccion } from "@/components/formulario";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { facturarAccion, reenviarLinkAccion } from "../acciones";

export function ReenviarLink({ ordenId, reenvios }: { ordenId: string; reenvios: number }) {
  const [estado, accion] = useActionState(reenviarLinkAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  return (
    <form action={accion} className="space-y-1">
      <input type="hidden" name="ordenId" value={ordenId} />
      <BotonEnviar variant="outline" className="w-full">
        <Send data-icon="inline-start" /> Reenviar link de pago
      </BotonEnviar>
      {reenvios > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Reenviado {reenvios} {reenvios === 1 ? "vez" : "veces"}
        </p>
      )}
    </form>
  );
}

export function EmitirFactura({ ordenId }: { ordenId: string }) {
  const [estado, accion] = useActionState(facturarAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  return (
    <form action={accion}>
      <input type="hidden" name="ordenId" value={ordenId} />
      <BotonEnviar variant="outline" className="w-full">
        <FileText data-icon="inline-start" /> Emitir factura
      </BotonEnviar>
    </form>
  );
}
