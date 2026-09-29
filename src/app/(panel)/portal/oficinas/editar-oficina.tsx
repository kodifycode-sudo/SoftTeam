"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
  Casilla,
  FormularioConservado,
  MensajeFormulario,
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
import { editarOficinaAccion, renombrarCanalAccion } from "./acciones";

export interface DatosOficina {
  id: string;
  codigo: string;
  nombre: string;
  telefono: string | null;
  whatsapp: string | null;
  domicilio: string | null;
  redes: Partial<Record<"web" | "facebook" | "instagram" | "linkedin", string>> | null;
  notifica: boolean;
  activa: boolean;
}

function ContenidoOficina({
  oficina,
  puedeDesactivar,
  cerrar,
}: {
  oficina: DatosOficina;
  puedeDesactivar: boolean;
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(editarOficinaAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-4" noValidate>
      <input type="hidden" name="oficinaId" value={oficina.id} />
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <Campo nombre="nombre" etiqueta="Nombre" defaultValue={oficina.nombre} estado={estado} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          nombre="telefono"
          etiqueta="Teléfono"
          type="tel"
          defaultValue={oficina.telefono ?? ""}
          estado={estado}
        />
        <Campo
          nombre="whatsapp"
          etiqueta="WhatsApp"
          type="tel"
          defaultValue={oficina.whatsapp ?? ""}
          estado={estado}
        />
      </div>
      <Campo
        nombre="domicilio"
        etiqueta="Domicilio"
        defaultValue={oficina.domicilio ?? ""}
        estado={estado}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {(["web", "facebook", "instagram", "linkedin"] as const).map((r) => (
          <Campo
            key={r}
            nombre={r}
            etiqueta={
              { web: "Web", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn" }[r]
            }
            defaultValue={oficina.redes?.[r] ?? ""}
            estado={estado}
          />
        ))}
      </div>
      <Casilla
        id={`notifica-${oficina.id}`}
        nombre="notifica"
        etiqueta="Envía notificaciones a sus asegurados"
        descripcion="Si la empresa lo permite en sus políticas. Los productos lo reciben con la oficina."
        marcada={oficina.notifica}
      />
      {!puedeDesactivar && oficina.activa && <input type="hidden" name="activa" value="on" />}
      <Casilla
        nombre="activa"
        etiqueta="Oficina activa"
        descripcion={
          puedeDesactivar
            ? "Una oficina inactiva no consume ni aparece en los productos. La empresa conserva al menos una activa."
            : "No podés desactivar la oficina que administrás."
        }
        marcada={oficina.activa}
        deshabilitada={!puedeDesactivar}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Guardar</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function EditarOficina({
  oficina,
  puedeDesactivar,
}: {
  oficina: DatosOficina;
  puedeDesactivar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Editar la oficina ${oficina.codigo} ${oficina.nombre}`}
          />
        }
      >
        <Pencil data-icon="inline-start" /> Editar
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Oficina {oficina.codigo} · {oficina.nombre}
          </DialogTitle>
          <DialogDescription>Los productos reciben el cambio.</DialogDescription>
        </DialogHeader>
        {abierto && (
          <ContenidoOficina
            oficina={oficina}
            puedeDesactivar={puedeDesactivar}
            cerrar={() => setAbierto(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContenidoCanal({
  canal,
  cerrar,
}: {
  canal: { id: string; codigo: string; nombre: string };
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(renombrarCanalAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-4" noValidate>
      <input type="hidden" name="canalId" value={canal.id} />
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <Campo
        nombre="nombre"
        etiqueta="Nombre del canal"
        defaultValue={canal.nombre}
        estado={estado}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Guardar</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function RenombrarCanal({
  canal,
}: {
  canal: { id: string; codigo: string; nombre: string };
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Renombrar el canal ${canal.codigo}`}
          />
        }
      >
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Canal {canal.codigo}</DialogTitle>
          <DialogDescription>El código del canal no cambia.</DialogDescription>
        </DialogHeader>
        {abierto && <ContenidoCanal canal={canal} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
