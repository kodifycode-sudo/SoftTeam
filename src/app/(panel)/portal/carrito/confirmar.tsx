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
  diaVenc,
  claveIdempotencia,
  total,
  altaAGrupo,
}: {
  medioPagoId: string;
  ticketCodigo: string | null;
  diaVenc: number | null;
  claveIdempotencia: string;
  total: string;
  /** Alta a grupo: no se genera orden; se cobra en la orden colectiva. */
  altaAGrupo: boolean;
}) {
  const [estado, accion] = useActionState(confirmarOrdenAccion, ESTADO_INICIAL);
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="medioPagoId" value={medioPagoId} />
      {ticketCodigo && <input type="hidden" name="ticketCodigo" value={ticketCodigo} />}
      {diaVenc && <input type="hidden" name="diaVenc" value={diaVenc} />}
      <input type="hidden" name="claveIdempotencia" value={claveIdempotencia} />
      <MensajeFormulario estado={estado} />
      <Field orientation="horizontal">
        <Checkbox id="acepta" name="acepta" value="on" />
        <FieldLabel htmlFor="acepta" className="font-normal leading-snug">
          {altaAGrupo
            ? `Revisé los paquetes y el importe de ${total}, que se suma a la próxima factura del grupo.`
            : `Revisé los paquetes y el total de ${total}.`}
        </FieldLabel>
      </Field>
      <BotonEnviar size="lg" className="h-11 w-full text-base">
        <ShieldCheck data-icon="inline-start" /> {altaAGrupo ? "Confirmar alta" : "Confirmar orden"}
      </BotonEnviar>
    </form>
  );
}
