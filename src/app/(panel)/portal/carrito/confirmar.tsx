"use client";

import { ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { BotonEnviar, MensajeFormulario } from "@/components/formulario";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { confirmarOrdenAccion } from "../compra/acciones";

export function ConfirmarOrden({
  medioPagoId,
  ticketCodigo,
  claveIdempotencia,
  total,
}: {
  medioPagoId: string;
  ticketCodigo: string | null;
  claveIdempotencia: string;
  total: string;
}) {
  const [estado, accion] = useActionState(confirmarOrdenAccion, ESTADO_INICIAL);
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="medioPagoId" value={medioPagoId} />
      {ticketCodigo && <input type="hidden" name="ticketCodigo" value={ticketCodigo} />}
      <input type="hidden" name="claveIdempotencia" value={claveIdempotencia} />
      <MensajeFormulario estado={estado} />
      <Field orientation="horizontal">
        <Checkbox id="acepta" name="acepta" value="on" />
        <FieldLabel htmlFor="acepta" className="font-normal leading-snug">
          Revisé los paquetes y el total de {total}.
        </FieldLabel>
      </Field>
      <BotonEnviar size="lg" className="h-11 w-full text-base">
        <ShieldCheck data-icon="inline-start" /> Confirmar orden
      </BotonEnviar>
    </form>
  );
}
