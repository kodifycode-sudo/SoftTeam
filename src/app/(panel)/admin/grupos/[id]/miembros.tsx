"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useActionState } from "react";
import { BotonEnviar, Campo, useAvisoDeAccion } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { agregarAlGrupoAccion, eliminarGrupoAccion } from "../acciones";

/** Sumar un cliente al grupo por su CUIT o número. */
export function AgregarMiembro({ grupoId }: { grupoId: string }) {
  const [estado, accion] = useActionState(agregarAlGrupoAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  return (
    <form action={accion} className="flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
      <input type="hidden" name="grupoId" value={grupoId} />
      <Campo
        nombre="cliente"
        etiqueta="Sumar un cliente (CUIT o número)"
        estado={estado.ok ? ESTADO_INICIAL : estado}
        className="flex-1"
      />
      <BotonEnviar className="sm:mt-6">
        <UserPlus data-icon="inline-start" /> Sumar
      </BotonEnviar>
    </form>
  );
}

/** Borrar el grupo (solo sin clientes). */
export function EliminarGrupo({ grupoId }: { grupoId: string }) {
  const [estado, accion] = useActionState(eliminarGrupoAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  return (
    <form action={accion}>
      <input type="hidden" name="grupoId" value={grupoId} />
      <Button type="submit" variant="ghost">
        <Trash2 data-icon="inline-start" /> Borrar grupo
      </Button>
    </form>
  );
}
