"use client";

import { TicketPlus } from "lucide-react";
import { useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
  FormularioConservado,
  MensajeFormulario,
  useAvisoDeAccion,
} from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { crearTicketAccion } from "./acciones";

function ContenidoNuevoTicket({
  paquetes,
  hoy,
  cerrar,
}: {
  paquetes: { id: string; nombre: string }[];
  hoy: string;
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(crearTicketAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate>
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="codigo"
            etiqueta="Código"
            placeholder="BIENVENIDA"
            ayuda="Lo que escribe el cliente en el carrito."
            estado={estado}
          />
          <Campo nombre="descripcion" etiqueta="Descripción (opcional)" estado={estado} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="porcentaje"
            etiqueta="Descuento (%)"
            inputMode="decimal"
            placeholder="20"
            estado={estado}
          />
          <Campo
            nombre="tope"
            etiqueta="Tope por compra ($)"
            inputMode="decimal"
            placeholder="50000"
            ayuda="Descuento máximo en una misma compra."
            estado={estado}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="vigenteDesde"
            etiqueta="Se puede usar desde"
            type="date"
            defaultValue={hoy}
            estado={estado}
          />
          <Campo nombre="vigenteHasta" etiqueta="Hasta" type="date" estado={estado} />
        </div>
      </FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">Paquetes</FieldLegend>
        <FieldDescription>
          Sin elegir ninguno, aplica a todos. Si elegís algunos, todos los paquetes de la orden
          tienen que estar en la lista.
        </FieldDescription>
        <div className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
          {paquetes.map((p) => (
            <Field key={p.id} orientation="horizontal">
              <Checkbox id={`paquete-${p.id}`} name="paquetes" value={p.id} />
              <FieldLabel htmlFor={`paquete-${p.id}`} className="font-normal">
                {p.nombre}
              </FieldLabel>
            </Field>
          ))}
        </div>
      </FieldSet>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Crear ticket</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function NuevoTicket(props: { paquetes: { id: string; nombre: string }[]; hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="lg" />}>
        <TicketPlus data-icon="inline-start" /> Nuevo ticket
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo ticket de descuento</DialogTitle>
          <DialogDescription>
            Un porcentaje con tope, solo para paquetes nuevos: no aplica a renovaciones, a clientes
            corporativos ni sobre paquetes bonificados.
          </DialogDescription>
        </DialogHeader>
        {abierto && <ContenidoNuevoTicket {...props} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
