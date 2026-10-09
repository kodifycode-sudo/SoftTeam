"use client";

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/formulario";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MODOS_FACTURACION, NOMBRE_MODO } from "@/domain/facturacion/modo";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { guardarMedioPagoAccion } from "./acciones";

export interface MedioEditable {
  id: string;
  nombre: string;
  ajuste: string;
  habilitadoAlta: boolean;
  habilitadoAdicional: boolean;
  habilitadoRenovacion: boolean;
  modosFacturacion: number[];
  activo: boolean;
  instrucciones: string;
}

function Interruptor({
  nombre,
  etiqueta,
  activo,
}: {
  nombre: string;
  etiqueta: string;
  activo: boolean;
}) {
  return (
    <Field orientation="horizontal" className="justify-between rounded-lg border px-3 py-2.5">
      <FieldLabel htmlFor={`sw-${nombre}`} className="font-normal">
        {etiqueta}
      </FieldLabel>
      <Switch id={`sw-${nombre}`} name={nombre} defaultChecked={activo} />
    </Field>
  );
}

export function EditarMedioPago({ medio }: { medio: MedioEditable }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState(guardarMedioPagoAccion, ESTADO_INICIAL);

  useEffect(() => {
    if (estado.ok) {
      setAbierto(false);
      toast.success(`${medio.nombre}: cambios guardados`);
    }
  }, [estado, medio.nombre]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil data-icon="inline-start" /> Editar
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {medio.nombre}</DialogTitle>
          <DialogDescription>
            El ajuste se aplica antes del IVA en las órdenes nuevas. Las órdenes ya emitidas no
            cambian.
          </DialogDescription>
        </DialogHeader>
        <form action={accion} className="space-y-5">
          <input type="hidden" name="id" value={medio.id} />
          {!estado.ok && <MensajeFormulario estado={estado} />}
          <FieldGroup className="grid gap-4 sm:grid-cols-3">
            <Campo
              nombre="nombre"
              etiqueta="Nombre"
              defaultValue={medio.nombre}
              className="sm:col-span-2"
              estado={estado}
            />
            <Campo
              nombre="ajustePorcentaje"
              etiqueta="Ajuste %"
              defaultValue={medio.ajuste}
              inputMode="decimal"
              ayuda="+ recargo, − bonificación"
              estado={estado}
            />
          </FieldGroup>
          <div className="space-y-2">
            <p className="text-sm font-medium">Disponible para</p>
            <Interruptor
              nombre="habilitadoAlta"
              etiqueta="Alta inicial"
              activo={medio.habilitadoAlta}
            />
            <Interruptor
              nombre="habilitadoAdicional"
              etiqueta="Paquetes adicionales"
              activo={medio.habilitadoAdicional}
            />
            <Interruptor
              nombre="habilitadoRenovacion"
              etiqueta="Renovaciones"
              activo={medio.habilitadoRenovacion}
            />
            <Interruptor nombre="activo" etiqueta="Medio activo" activo={medio.activo} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Modos de facturación que lo usan</p>
            {MODOS_FACTURACION.map((m) => (
              <Interruptor
                key={m}
                nombre={`modo${m}`}
                etiqueta={NOMBRE_MODO[m]}
                activo={medio.modosFacturacion.includes(m)}
              />
            ))}
            {estado.errores?.modosFacturacion && (
              <p className="text-sm text-destructive">{estado.errores.modosFacturacion[0]}</p>
            )}
          </div>
          <Field>
            <FieldLabel htmlFor={`instr-${medio.id}`}>Instrucciones para el cliente</FieldLabel>
            <Textarea
              id={`instr-${medio.id}`}
              name="instrucciones"
              rows={3}
              defaultValue={medio.instrucciones}
              placeholder="Datos bancarios, a dónde enviar el comprobante…"
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
            <BotonEnviar>Guardar</BotonEnviar>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
