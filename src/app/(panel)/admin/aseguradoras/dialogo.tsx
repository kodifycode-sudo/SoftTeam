"use client";

import { Pencil, Plus } from "lucide-react";
import { type ReactElement, useActionState, useState } from "react";
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
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { guardarAseguradoraAccion } from "./acciones";

export interface DatosAseguradora {
  id: string;
  nombre: string;
  abreviatura: string;
  codigoLegal: string | null;
  interfazProdigalDisponible: boolean;
  interfazCotiwebDisponible: boolean;
  interfazDocumentosDisponible: boolean;
  activa: boolean;
  empresas: number;
  conProdigal: number;
  conCotiweb: number;
}

/** "Activa en 3 empresas": lo que sigue funcionando aunque se quite la disponibilidad. */
const enUso = (n: number) =>
  n > 0
    ? `Activa en ${n} empresa${n === 1 ? "" : "s"}: si la quitás, la conservan hasta darla de baja.`
    : undefined;

function Contenido({
  aseguradora,
  cerrar,
}: {
  aseguradora?: DatosAseguradora;
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(guardarAseguradoraAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate>
      {aseguradora && <input type="hidden" name="id" value={aseguradora.id} />}
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <FieldGroup>
        <Campo
          nombre="nombre"
          etiqueta="Nombre"
          placeholder="Sancor Seguros"
          defaultValue={aseguradora?.nombre}
          estado={estado}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="abreviatura"
            etiqueta="Abreviatura"
            placeholder="SANCOR"
            maxLength={10}
            ayuda="La usan los productos para identificarla."
            defaultValue={aseguradora?.abreviatura}
            estado={estado}
          />
          <Campo
            nombre="codigoLegal"
            etiqueta="Código SSN (opcional)"
            inputMode="numeric"
            maxLength={10}
            defaultValue={aseguradora?.codigoLegal ?? ""}
            estado={estado}
          />
        </div>
      </FieldGroup>
      <FieldSet>
        <FieldLegend variant="label">Interfaces disponibles</FieldLegend>
        <FieldDescription>
          Las empresas solo pueden activar las interfaces que estén disponibles.
        </FieldDescription>
        <div className="grid gap-3">
          <Casilla
            nombre="interfazProdigalDisponible"
            etiqueta="Interfaz con Prodigal"
            descripcion={enUso(aseguradora?.conProdigal ?? 0)}
            marcada={aseguradora?.interfazProdigalDisponible ?? false}
          />
          <Casilla
            nombre="interfazCotiwebDisponible"
            etiqueta="Interfaz con CotiWeb"
            descripcion={enUso(aseguradora?.conCotiweb ?? 0)}
            marcada={aseguradora?.interfazCotiwebDisponible ?? false}
          />
          <Casilla
            nombre="interfazDocumentosDisponible"
            etiqueta="Interfaz de documentos"
            marcada={aseguradora?.interfazDocumentosDisponible ?? false}
          />
        </div>
      </FieldSet>
      {aseguradora && (
        <Casilla
          nombre="activa"
          etiqueta="Activa en el catálogo"
          descripcion={
            aseguradora.empresas > 0
              ? `Trabajan con ella ${aseguradora.empresas} empresa${aseguradora.empresas === 1 ? "" : "s"}. Si la discontinuás, la siguen viendo para darla de baja, pero nadie más puede activarla.`
              : "Discontinuada, deja de aparecer para las empresas."
          }
          marcada={aseguradora.activa}
        />
      )}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>{aseguradora ? "Guardar cambios" : "Agregar aseguradora"}</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

function DialogoAseguradora({
  aseguradora,
  disparador,
}: {
  aseguradora?: DatosAseguradora;
  disparador: ReactElement;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={disparador} />
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {aseguradora ? `Editar ${aseguradora.nombre}` : "Nueva aseguradora"}
          </DialogTitle>
          <DialogDescription>
            El catálogo con el que las empresas eligen con quién trabajan y qué interfaces usan.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido aseguradora={aseguradora} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function NuevaAseguradora() {
  return (
    <DialogoAseguradora
      disparador={
        <Button size="lg">
          <Plus data-icon="inline-start" /> Nueva aseguradora
        </Button>
      }
    />
  );
}

export function EditarAseguradora({ aseguradora }: { aseguradora: DatosAseguradora }) {
  return (
    <DialogoAseguradora
      aseguradora={aseguradora}
      disparador={
        <Button variant="ghost" size="sm" aria-label={`Editar ${aseguradora.nombre}`}>
          <Pencil data-icon="inline-start" /> Editar
        </Button>
      }
    />
  );
}
