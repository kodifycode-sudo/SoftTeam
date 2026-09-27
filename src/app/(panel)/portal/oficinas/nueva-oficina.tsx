"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { BotonEnviar, Campo, MensajeFormulario } from "@/components/formulario";
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
import { ESTADO_INICIAL } from "@/lib/formulario";
import { crearOficinaAccion } from "./acciones";

export function NuevaOficina({
  canales,
  permitirCanalNuevo = true,
}: {
  canales: { id: string; codigo: string; nombre: string }[];
  /** Un delegado de canal solo suma oficinas a su canal. */
  permitirCanalNuevo?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState(crearOficinaAccion, ESTADO_INICIAL);
  const [canal, setCanal] = useState(canales[0]?.id ?? "nuevo");

  useEffect(() => {
    if (estado.ok && estado.mensaje) {
      setAbierto(false);
      toast.success(estado.mensaje);
    }
  }, [estado]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="lg" />}>
        <Plus data-icon="inline-start" /> Nueva oficina
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva oficina</DialogTitle>
          <DialogDescription>
            Sucursales, puntos de venta u oficinas de productores. El código se asigna solo.
          </DialogDescription>
        </DialogHeader>
        <form action={accion} className="space-y-5">
          {!estado.ok && <MensajeFormulario estado={estado} />}
          <FieldGroup>
            <Field data-invalid={estado.errores?.canalId ? true : undefined}>
              <FieldLabel htmlFor="canalId">Canal</FieldLabel>
              <SelectNativo
                id="canalId"
                name="canalId"
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
              >
                {canales.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} · {c.nombre}
                  </option>
                ))}
                {permitirCanalNuevo && <option value="nuevo">+ Crear un canal nuevo…</option>}
              </SelectNativo>
              <FieldError errors={estado.errores?.canalId?.map((message) => ({ message }))} />
            </Field>
            {canal === "nuevo" && (
              <Campo
                nombre="canalNuevo"
                etiqueta="Nombre del canal nuevo"
                placeholder="Productores asociados"
                estado={estado}
              />
            )}
            <Campo
              nombre="nombre"
              etiqueta="Nombre de la oficina"
              placeholder="Sucursal Rosario"
              estado={estado}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo nombre="telefono" etiqueta="Teléfono" type="tel" estado={estado} />
              <Campo nombre="domicilio" etiqueta="Domicilio" estado={estado} />
            </div>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
            <BotonEnviar>Crear oficina</BotonEnviar>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
