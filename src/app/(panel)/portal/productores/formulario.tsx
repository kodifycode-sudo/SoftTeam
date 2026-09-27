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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { CONDICIONES_IVA_ETIQUETA } from "@/lib/argentina";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { guardarProductorAccion } from "./acciones";

export interface DatosProductor {
  id: string;
  nombre: string;
  matricula: string | null;
  tipoPersona: string | null;
  cuit: string | null;
  condicionIva: string | null;
  email: string | null;
  telefono: string | null;
  celular: string | null;
  domicilio: string | null;
  oficinaId: string | null;
  esProductor: boolean;
  esOrganizador: boolean;
  esSubproductor: boolean;
  agenteInstitorio: boolean;
}

function Selector({
  nombre,
  etiqueta,
  estado,
  valorInicial,
  children,
}: {
  nombre: string;
  etiqueta: string;
  estado: EstadoFormulario;
  valorInicial: string;
  children: React.ReactNode;
}) {
  const errores = estado.errores?.[nombre];
  return (
    <Field data-invalid={errores ? true : undefined}>
      <FieldLabel htmlFor={nombre}>{etiqueta}</FieldLabel>
      <SelectNativo
        id={nombre}
        name={nombre}
        defaultValue={estado.valores?.[nombre] ?? valorInicial}
      >
        {children}
      </SelectNativo>
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}

function ContenidoProductor({
  productor,
  oficinas,
  tieneInstitorio,
  sinOficina = true,
  cerrar,
}: {
  productor?: DatosProductor;
  oficinas: { id: string; etiqueta: string }[];
  tieneInstitorio: boolean;
  /** Un delegado asigna siempre una de sus oficinas. */
  sinOficina?: boolean;
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(guardarProductorAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  const v = (campo: keyof DatosProductor) => {
    const valor = productor?.[campo];
    return typeof valor === "string" ? valor : "";
  };

  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate>
      {productor && <input type="hidden" name="id" value={productor.id} />}
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Campo
            nombre="nombre"
            etiqueta="Nombre o razón social"
            defaultValue={v("nombre")}
            estado={estado}
          />
          <Campo
            nombre="matricula"
            etiqueta="Matrícula"
            defaultValue={v("matricula")}
            estado={estado}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Selector
            nombre="tipoPersona"
            etiqueta="Persona"
            estado={estado}
            valorInicial={v("tipoPersona")}
          >
            <option value="">Sin indicar</option>
            <option value="FISICA">Física</option>
            <option value="JURIDICA">Jurídica</option>
          </Selector>
          <Campo
            nombre="cuit"
            etiqueta="CUIT"
            inputMode="numeric"
            placeholder="20-12345678-6"
            defaultValue={v("cuit")}
            estado={estado}
          />
          <Selector
            nombre="condicionIva"
            etiqueta="Condición de IVA"
            estado={estado}
            valorInicial={v("condicionIva")}
          >
            <option value="">Sin indicar</option>
            {Object.entries(CONDICIONES_IVA_ETIQUETA).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Selector>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            nombre="email"
            etiqueta="Mail"
            type="email"
            defaultValue={v("email")}
            estado={estado}
          />
          <Campo
            nombre="telefono"
            etiqueta="Teléfono"
            type="tel"
            defaultValue={v("telefono")}
            estado={estado}
          />
          <Campo
            nombre="celular"
            etiqueta="Celular"
            type="tel"
            defaultValue={v("celular")}
            estado={estado}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="domicilio"
            etiqueta="Domicilio"
            defaultValue={v("domicilio")}
            estado={estado}
          />
          <Selector
            nombre="oficinaId"
            etiqueta="Oficina"
            estado={estado}
            valorInicial={v("oficinaId")}
          >
            {sinOficina && <option value="">Sin oficina</option>}
            {oficinas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta}
              </option>
            ))}
          </Selector>
        </div>
      </FieldGroup>

      <FieldSet data-invalid={estado.errores?.roles ? true : undefined}>
        <FieldLegend variant="label">Roles</FieldLegend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Casilla
            nombre="esProductor"
            etiqueta="Productor"
            marcada={productor?.esProductor ?? true}
          />
          <Casilla
            nombre="esOrganizador"
            etiqueta="Organizador"
            marcada={productor?.esOrganizador ?? false}
          />
          <Casilla
            nombre="esSubproductor"
            etiqueta="Subproductor"
            marcada={productor?.esSubproductor ?? false}
          />
        </div>
        <FieldError errors={estado.errores?.roles?.map((message) => ({ message }))} />
      </FieldSet>

      <FieldSet data-invalid={estado.errores?.agenteInstitorio ? true : undefined}>
        <Casilla
          nombre="agenteInstitorio"
          etiqueta="Agente institorio"
          descripcion={
            tieneInstitorio
              ? "Opera como agente institorio de una aseguradora."
              : "Requiere la función de agente institorio en tu licencia."
          }
          marcada={productor?.agenteInstitorio ?? false}
          deshabilitada={!tieneInstitorio && !productor?.agenteInstitorio}
        />
        <FieldError errors={estado.errores?.agenteInstitorio?.map((message) => ({ message }))} />
      </FieldSet>

      <FieldDescription>
        Después de guardar podés cargar sus códigos en cada aseguradora.
      </FieldDescription>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>{productor ? "Guardar cambios" : "Crear productor"}</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

function DialogoProductor({
  disparador,
  productor,
  ...props
}: {
  disparador: ReactElement;
  productor?: DatosProductor;
  oficinas: { id: string; etiqueta: string }[];
  tieneInstitorio: boolean;
  sinOficina?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={disparador} />
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {productor ? `Editar a ${productor.nombre}` : "Nuevo productor"}
          </DialogTitle>
          <DialogDescription>
            Productores, organizadores y subproductores de la empresa. Los productos los usan para
            asignar cartera y comisiones.
          </DialogDescription>
        </DialogHeader>
        {abierto && (
          <ContenidoProductor productor={productor} cerrar={() => setAbierto(false)} {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function NuevoProductor(props: {
  oficinas: { id: string; etiqueta: string }[];
  tieneInstitorio: boolean;
  sinOficina?: boolean;
}) {
  return (
    <DialogoProductor
      {...props}
      disparador={
        <Button size="lg">
          <Plus data-icon="inline-start" /> Nuevo productor
        </Button>
      }
    />
  );
}

export function EditarProductor(props: {
  productor: DatosProductor;
  oficinas: { id: string; etiqueta: string }[];
  tieneInstitorio: boolean;
  sinOficina?: boolean;
}) {
  return (
    <DialogoProductor
      {...props}
      disparador={
        <Button variant="outline">
          <Pencil data-icon="inline-start" /> Editar datos
        </Button>
      }
    />
  );
}
