"use client";

import { Plus } from "lucide-react";
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
import { nuevaEmpresaAccion } from "./acciones";

function Contenido({
  clienteId,
  administrador,
  cerrar,
}: {
  clienteId: string;
  administrador: { nombre: string; email: string | null };
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(nuevaEmpresaAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-4" noValidate>
      <input type="hidden" name="clienteId" value={clienteId} />
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <Campo nombre="empresa.nombre" etiqueta="Nombre de la empresa" estado={estado} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Selector
          nombre="empresa.tipoInstalacion"
          etiqueta="Instalación"
          estado={estado}
          valorInicial="SAAS"
        >
          <option value="SAAS">SaaS (en la nube)</option>
          <option value="ON_PREMISE">On-premise</option>
        </Selector>
      </div>
      <Campo
        nombre="administrador.nombre"
        etiqueta="Administrador"
        defaultValue={administrador.nombre}
        estado={estado}
      />
      <Campo
        nombre="administrador.email"
        etiqueta="Mail del administrador"
        type="email"
        defaultValue={administrador.email ?? ""}
        estado={estado}
      />
      <Casilla
        nombre="invitar"
        etiqueta="Enviarle el acceso por mail"
        descripcion="Si ya administra otra empresa del cliente, entra con su misma cuenta."
        marcada={true}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Crear empresa</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

/** Una empresa más para el cliente: otra instalación con su licencia, facturada al mismo cliente. */
export function NuevaEmpresa(props: {
  clienteId: string;
  administrador: { nombre: string; email: string | null };
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus data-icon="inline-start" /> Nueva empresa
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva empresa del cliente</DialogTitle>
          <DialogDescription>
            Otra instalación con su propia licencia, usuarios y datos. Se factura al mismo cliente.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido {...props} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
