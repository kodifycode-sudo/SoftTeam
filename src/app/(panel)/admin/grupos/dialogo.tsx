"use client";

import { Pencil, Plus } from "lucide-react";
import { type ReactElement, useActionState, useState } from "react";
import {
  BotonEnviar,
  Campo,
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
import { guardarGrupoAccion } from "./acciones";

export interface DatosGrupo {
  id: string;
  nombre: string;
  nombreCorto: string;
  /** CUIT o número del cliente principal y del de facturación, para editarlos. */
  principal: string;
  facturacion: string;
}

function Contenido({ grupo, cerrar }: { grupo?: DatosGrupo; cerrar: () => void }) {
  const [estado, accion] = useActionState(guardarGrupoAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-4" noValidate>
      {grupo && <input type="hidden" name="id" value={grupo.id} />}
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <Campo nombre="nombre" etiqueta="Nombre" defaultValue={grupo?.nombre} estado={estado} />
      <Campo
        nombre="nombreCorto"
        etiqueta="Nombre corto"
        maxLength={20}
        defaultValue={grupo?.nombreCorto}
        estado={estado}
      />
      <Campo
        nombre="principal"
        etiqueta="Cliente principal (CUIT o número, opcional)"
        ayuda="Quien encabeza el grupo. Pasa a ser parte del grupo."
        defaultValue={grupo?.principal}
        estado={estado}
      />
      <Campo
        nombre="facturacion"
        etiqueta="Cliente de facturación consolidada (opcional)"
        ayuda="Recibe una sola factura por las órdenes pagadas con un medio de planilla. Puede no ser del grupo (por ejemplo, la aseguradora que paga)."
        defaultValue={grupo?.facturacion}
        estado={estado}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>{grupo ? "Guardar" : "Crear grupo"}</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

function DialogoGrupo({ grupo, disparador }: { grupo?: DatosGrupo; disparador: ReactElement }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={disparador} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{grupo ? `Editar ${grupo.nombre}` : "Nuevo grupo económico"}</DialogTitle>
          <DialogDescription>
            Agrupa clientes para reportes y, con un cliente de facturación, para la facturación
            consolidada.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido grupo={grupo} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function NuevoGrupo() {
  return (
    <DialogoGrupo
      disparador={
        <Button size="lg">
          <Plus data-icon="inline-start" /> Nuevo grupo
        </Button>
      }
    />
  );
}

export function EditarGrupo({ grupo }: { grupo: DatosGrupo }) {
  return (
    <DialogoGrupo
      grupo={grupo}
      disparador={
        <Button variant="outline">
          <Pencil data-icon="inline-start" /> Editar
        </Button>
      }
    />
  );
}
