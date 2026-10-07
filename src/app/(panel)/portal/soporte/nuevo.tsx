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
import { CampoAdjuntos } from "@/components/soporte/campo-adjuntos";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { usaTicket } from "@/domain/soporte/tickets";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { abrirIncidenteAccion } from "./acciones";

/** Si el pedido usa un ticket y cuántos quedan; sin tickets, cómo seguir. */
function AvisoTicket({ producto, disponibles }: { producto: string; disponibles: number }) {
  if (!usaTicket(producto)) {
    return <FieldDescription>Las consultas sobre tu cuenta no usan tickets.</FieldDescription>;
  }
  if (disponibles > 0) {
    return (
      <FieldDescription>
        Usa 1 de tus {disponibles} ticket{disponibles === 1 ? "" : "s"} de soporte.
      </FieldDescription>
    );
  }
  return (
    <FieldDescription className="text-destructive">
      No te quedan tickets de soporte técnico. Si es una consulta sobre tu cuenta, licencias o
      pagos, elegí "Mi cuenta, licencias y pagos"; si no, sumá un paquete de soporte.
    </FieldDescription>
  );
}

function ContenidoNuevo({
  productos,
  disponibles,
  productoInicial,
}: {
  productos: Record<string, string>;
  disponibles: number;
  productoInicial: string;
}) {
  const [estado, accion] = useActionState(abrirIncidenteAccion, ESTADO_INICIAL);
  const [producto, setProducto] = useState(estado.valores?.producto ?? productoInicial);
  const sinTicket = usaTicket(producto) && disponibles <= 0;
  const errorTexto = estado.errores?.texto;
  return (
    <FormularioConservado accion={accion} className="space-y-5" noValidate>
      <MensajeFormulario estado={estado} />
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="producto">Sobre qué es</FieldLabel>
            <SelectNativo
              id="producto"
              name="producto"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
            >
              {Object.entries(productos).map(([valor, nombre]) => (
                <option key={valor} value={valor}>
                  {nombre}
                </option>
              ))}
            </SelectNativo>
            <AvisoTicket producto={producto} disponibles={disponibles} />
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
        <CampoAdjuntos id="adjuntos-nuevo" errores={estado.errores?.adjuntos} />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar disabled={sinTicket}>Enviar a Soporte</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function NuevoIncidente({
  productos,
  disponibles,
  productoInicial = "prodigal",
  boton = "Nuevo pedido",
  variante = "default",
}: {
  productos: Record<string, string>;
  disponibles: number;
  /** Producto elegido al abrir (la ayuda abre con "Mi cuenta, licencias y pagos"). */
  productoInicial?: string;
  boton?: string;
  variante?: "default" | "outline";
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {/* Siempre disponible: sin tickets igual se puede consultar sobre la cuenta. */}
      <DialogTrigger render={<Button size="lg" variant={variante} />}>
        <LifeBuoy data-icon="inline-start" /> {boton}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo pedido de soporte</DialogTitle>
          <DialogDescription>Te respondemos por acá y te avisamos por mail.</DialogDescription>
        </DialogHeader>
        {abierto && (
          <ContenidoNuevo
            productos={productos}
            disponibles={disponibles}
            productoInicial={productoInicial}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
