"use client";

import { FileText, Send } from "lucide-react";
import { useActionState } from "react";
import { BotonEnviar, Campo, MensajeFormulario, useAvisoDeAccion } from "@/components/formulario";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { facturarAccion, reenviarLinkAccion, registrarFacturaManualAccion } from "../acciones";

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

/** Factura emitida fuera del sistema, directamente en ARCA (emisor sin Xubio). */
export function FacturaManual({ ordenId }: { ordenId: string }) {
  const [estado, accion] = useActionState(registrarFacturaManualAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Registrar factura emitida a mano</summary>
      <form action={accion} className="mt-3 space-y-3">
        <input type="hidden" name="ordenId" value={ordenId} />
        {!estado.ok && <MensajeFormulario estado={estado} />}
        <Campo nombre="numero" etiqueta="Número" placeholder="A-0001-00001234" estado={estado} />
        <Campo nombre="fecha" etiqueta="Fecha" type="date" estado={estado} />
        <BotonEnviar variant="outline" className="w-full">
          Registrar factura
        </BotonEnviar>
      </form>
    </details>
  );
}
