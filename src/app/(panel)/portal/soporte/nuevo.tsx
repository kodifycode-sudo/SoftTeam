"use client";

import { LifeBuoy } from "lucide-react";
import { useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
  FormularioConservado,
  MensajeFormulario,
} from "@/components/formulario";
import { SelectNativo } from "@/components/select-nativo";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { abrirIncidenteAccion } from "./acciones";

function ContenidoNuevo({ productos }: { productos: Record<string, string> }) {
  const [estado, accion] = useActionState(abrirIncidenteAccion, ESTADO_INICIAL);
  const errorTexto = estado.errores?.texto;
  return (
    <FormularioConservado accion={accion} className="space-y-5" noValidate>
      <MensajeFormulario estado={estado} />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="producto">Producto</FieldLabel>
            <SelectNativo
              id="producto"
              name="producto"
              defaultValue={estado.valores?.producto ?? "prodigal"}
            >
              {Object.entries(productos).map(([valor, nombre]) => (
                <option key={valor} value={valor}>
                  {nombre}
                </option>
              ))}
            </SelectNativo>
          </Field>
          <Field>
            <FieldLabel htmlFor="prioridad">Urgencia</FieldLabel>
            <SelectNativo
              id="prioridad"
              name="prioridad"
              defaultValue={estado.valores?.prioridad ?? "MEDIA"}
            >
              <option value="BAJA">Baja: una consulta</option>
              <option value="MEDIA">Media: me complica el trabajo</option>
              <option value="ALTA">Alta: no puedo trabajar</option>
            </SelectNativo>
          </Field>
        </div>
        <Campo nombre="asunto" etiqueta="Asunto" maxLength={140} estado={estado} />
        <Field data-invalid={errorTexto ? true : undefined}>
          <FieldLabel htmlFor="texto">¿Qué pasa?</FieldLabel>
          <Textarea
            id="texto"
            name="texto"
            rows={6}
            maxLength={5000}
            defaultValue={estado.valores?.texto}
            placeholder="Contanos qué estabas haciendo, qué esperabas y qué pasó. Si hay un mensaje de error, copialo."
            aria-invalid={errorTexto ? true : undefined}
          />
          <FieldError errors={errorTexto?.map((message) => ({ message }))} />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Enviar a Soporte</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function NuevoIncidente({
  productos,
  disponibles,
}: {
  productos: Record<string, string>;
  disponibles: number;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="lg" disabled={disponibles <= 0} />}>
        <LifeBuoy data-icon="inline-start" /> Nuevo pedido
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo pedido de soporte</DialogTitle>
          <DialogDescription>
            Usa 1 de tus {disponibles} ticket{disponibles === 1 ? "" : "s"} disponible
            {disponibles === 1 ? "" : "s"}. Te respondemos por acá y te avisamos por mail.
          </DialogDescription>
        </DialogHeader>
        {abierto && <ContenidoNuevo productos={productos} />}
      </DialogContent>
    </Dialog>
  );
}
