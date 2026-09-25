"use client";

import { BadgeCheck, Ban } from "lucide-react";
import { useActionState, useState } from "react";
import { BotonEnviar, MensajeFormulario } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { cancelarOrdenAccion, registrarPagoAccion } from "../acciones";

export function AccionesOrden({
  ordenId,
  numero,
  total,
}: {
  ordenId: string;
  numero: number;
  total: string;
}) {
  const [estadoPago, pagar] = useActionState(registrarPagoAccion, ESTADO_INICIAL);
  const [estadoCancelar, cancelar] = useActionState(cancelarOrdenAccion, ESTADO_INICIAL);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [cancelarAbierto, setCancelarAbierto] = useState(false);

  return (
    <div className="grid gap-2">
      <Dialog open={pagoAbierto} onOpenChange={setPagoAbierto}>
        <DialogTrigger render={<Button size="lg" className="w-full" />}>
          <BadgeCheck data-icon="inline-start" /> Registrar pago
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar el pago de la orden #{numero}</DialogTitle>
            <DialogDescription>
              Confirmás que se acreditaron {total}. Los paquetes se activan ahora y la vigencia de
              los que todavía no la tenían empieza hoy.
            </DialogDescription>
          </DialogHeader>
          <form action={pagar} className="space-y-4">
            <input type="hidden" name="ordenId" value={ordenId} />
            <MensajeFormulario estado={estadoPago} />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" />}>Volver</DialogClose>
              <BotonEnviar>Sí, registrar pago</BotonEnviar>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelarAbierto} onOpenChange={setCancelarAbierto}>
        <DialogTrigger render={<Button variant="destructive" className="w-full" />}>
          <Ban data-icon="inline-start" /> Cancelar orden
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar la orden #{numero}</DialogTitle>
            <DialogDescription>
              Se cancelan también sus paquetes: dejan de sumar a la licencia, incluso los que
              estaban habilitados sin pago.
            </DialogDescription>
          </DialogHeader>
          <form action={cancelar} className="space-y-4">
            <input type="hidden" name="ordenId" value={ordenId} />
            {!estadoCancelar.ok && estadoCancelar.mensaje && (
              <MensajeFormulario estado={estadoCancelar} />
            )}
            <Field data-invalid={estadoCancelar.errores?.motivo ? true : undefined}>
              <FieldLabel htmlFor="motivo">Motivo</FieldLabel>
              <Textarea
                id="motivo"
                name="motivo"
                rows={3}
                placeholder="El cliente desistió de la compra…"
              />
              <FieldError
                errors={estadoCancelar.errores?.motivo?.map((message) => ({ message }))}
              />
            </Field>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="ghost" />}>Volver</DialogClose>
              <BotonEnviar variant="destructive">Cancelar orden</BotonEnviar>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
