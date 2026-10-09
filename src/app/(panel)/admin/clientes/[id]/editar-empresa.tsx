"use client";

import { Pencil } from "lucide-react";
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
import { guardarEmpresaAccion } from "./acciones";

export interface DatosEmpresa {
  id: string;
  version: string;
  nombre: string;
  nombreCorto: string;
  tipoInstalacion: "SAAS" | "ON_PREMISE";
  activa: boolean;
}

function Contenido({
  empresa,
  clienteId,
  administracion,
  cerrar,
}: {
  empresa: DatosEmpresa;
  clienteId: string;
  administracion: boolean;
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(guardarEmpresaAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-4" noValidate>
      <input type="hidden" name="empresaId" value={empresa.id} />
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="version" value={empresa.version} />
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <Campo nombre="nombre" etiqueta="Nombre" defaultValue={empresa.nombre} estado={estado} />
      <Campo
        nombre="nombreCorto"
        etiqueta="Nombre corto"
        maxLength={20}
        defaultValue={empresa.nombreCorto}
        ayuda="Lo usan los productos en pantallas chicas."
        estado={estado}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Selector
          nombre="tipoInstalacion"
          etiqueta="Instalación"
          estado={estado}
          valorInicial={empresa.tipoInstalacion}
        >
          <option value="SAAS">SaaS (en la nube)</option>
          <option value="ON_PREMISE">On-premise</option>
        </Selector>
      </div>
      {!administracion && empresa.activa && <input type="hidden" name="activa" value="on" />}
      <Casilla
        nombre="activa"
        etiqueta="Empresa activa"
        descripcion={
          administracion
            ? "Desactivarla corta el acceso al portal y los consumos de los productos."
            : "Solo Administración puede desactivarla."
        }
        marcada={empresa.activa}
        deshabilitada={!administracion}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Guardar</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function EditarEmpresa(props: {
  empresa: DatosEmpresa;
  clienteId: string;
  administracion: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Editar la empresa ${props.empresa.nombre}`}
          />
        }
      >
        <Pencil data-icon="inline-start" /> Editar
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {props.empresa.nombre}</DialogTitle>
          <DialogDescription>
            Los productos reciben el cambio. El tipo de cliente rige para las órdenes nuevas.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido {...props} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
