"use client";

import { Percent } from "lucide-react";
import { useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
  Casilla,
  FormularioConservado,
  MensajeFormulario,
  Selector,
  useAvisoDeAccion,
} from "@/components/formulario";
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
import { ESTADO_INICIAL } from "@/lib/formulario";
import { bonificarAccion } from "../acciones";

function Contenido({
  ordenId,
  lineas,
  cerrar,
}: {
  ordenId: string;
  lineas: { contratoId: string; descripcion: string }[];
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(bonificarAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-4" noValidate>
      <input type="hidden" name="ordenId" value={ordenId} />
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <Selector
        nombre="contratoId"
        etiqueta="Paquete"
        estado={estado}
        valorInicial={lineas[0]?.contratoId ?? ""}
      >
        {lineas.map((l) => (
          <option key={l.contratoId} value={l.contratoId}>
            {l.descripcion}
          </option>
        ))}
      </Selector>
      <Campo
        nombre="porcentaje"
        etiqueta="Bonificación (%)"
        inputMode="decimal"
        placeholder="10"
        ayuda="Sobre el precio de lista del paquete. 0 quita la bonificación."
        estado={estado}
      />
      <Campo nombre="motivo" etiqueta="Motivo" maxLength={200} estado={estado} />
      <Casilla
        nombre="recurrente"
        etiqueta="Mantenerla en las renovaciones"
        descripcion="Si no, se aplica solo a esta orden."
        marcada={false}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Aplicar y recalcular</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

/** Bonificar un paquete de una orden pendiente: la orden se recalcula y el link de pago se renueva. */
export function Bonificar(props: {
  ordenId: string;
  lineas: { contratoId: string; descripcion: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>
        <Percent data-icon="inline-start" /> Bonificar un paquete
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bonificar un paquete</DialogTitle>
          <DialogDescription>
            La orden se recalcula con el mismo medio de pago e IVA. Si había un link de pago, se
            genera uno nuevo por el importe actualizado.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido {...props} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
