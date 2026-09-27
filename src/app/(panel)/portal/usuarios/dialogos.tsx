"use client";

import { Pencil, Power, PowerOff, Send, UserPlus } from "lucide-react";
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
import { ESTADO_INICIAL } from "@/lib/formulario";
import {
  cambiarEstadoColaboradorAccion,
  guardarColaboradorAccion,
  reenviarInvitacionColaboradorAccion,
} from "./acciones";

export interface DatosColaborador {
  id: string;
  nombre: string;
  iniciales: string | null;
  email: string;
  telefono: string | null;
  alcance: string;
  usuarioProdigal: string | null;
  adminGeneral: boolean;
  adminComercial: boolean;
  adminOperativo: boolean;
  accesoProdigal: boolean;
  accesoCotiweb: boolean;
  accesoBienseguro: boolean;
  accesoBoletin: boolean;
}

export interface OpcionAlcance {
  valor: string;
  etiqueta: string;
}

export interface UsoAcceso {
  producto: "prodigal" | "cotiweb" | "bienseguro" | "boletin";
  nombre: string;
  licenciado: boolean;
  licenciados: number | null;
  enUso: number;
}

const COLUMNA = {
  prodigal: "accesoProdigal",
  cotiweb: "accesoCotiweb",
  bienseguro: "accesoBienseguro",
  boletin: "accesoBoletin",
} as const;

const PERMISOS = [
  {
    campo: "adminGeneral",
    etiqueta: "Administrador general",
    descripcion: "Todo, incluso dar permisos a otros.",
  },
  {
    campo: "adminComercial",
    etiqueta: "Paquetes y pagos",
    descripcion: "Compra paquetes y ve las órdenes.",
  },
  {
    campo: "adminOperativo",
    etiqueta: "Configuración",
    descripcion: "Usuarios, oficinas, aseguradoras, productores y políticas.",
  },
] as const;

function ContenidoColaborador({
  colaborador,
  alcances,
  uso,
  puedeDarPermisos,
  cerrar,
}: {
  colaborador?: DatosColaborador;
  alcances: OpcionAlcance[];
  uso: UsoAcceso[];
  puedeDarPermisos: boolean;
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(guardarColaboradorAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  const valor = (campo: keyof DatosColaborador) => {
    const v = colaborador?.[campo];
    return typeof v === "string" ? v : undefined;
  };

  return (
    <FormularioConservado accion={accion} className="space-y-6" noValidate>
      {colaborador && <input type="hidden" name="id" value={colaborador.id} />}
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <Campo
            nombre="nombre"
            etiqueta="Nombre y apellido"
            defaultValue={valor("nombre")}
            estado={estado}
          />
          <Campo
            nombre="iniciales"
            etiqueta="Iniciales"
            maxLength={5}
            defaultValue={valor("iniciales")}
            estado={estado}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            nombre="email"
            etiqueta="Mail"
            type="email"
            defaultValue={valor("email")}
            estado={estado}
          />
          <Campo
            nombre="telefono"
            etiqueta="Teléfono"
            type="tel"
            defaultValue={valor("telefono")}
            estado={estado}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={estado.errores?.alcance ? true : undefined}>
            <FieldLabel htmlFor="alcance">Qué puede ver</FieldLabel>
            <SelectNativo
              id="alcance"
              name="alcance"
              defaultValue={estado.valores?.alcance ?? colaborador?.alcance ?? "empresa"}
            >
              {alcances.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.etiqueta}
                </option>
              ))}
            </SelectNativo>
            <FieldDescription>
              Con un canal u oficina y algún permiso, administra solo esa parte de la empresa.
            </FieldDescription>
            <FieldError errors={estado.errores?.alcance?.map((message) => ({ message }))} />
          </Field>
          <Campo
            nombre="usuarioProdigal"
            etiqueta="Usuario en Prodigal"
            ayuda="Opcional. Hasta 20 caracteres."
            defaultValue={valor("usuarioProdigal")}
            estado={estado}
          />
        </div>
      </FieldGroup>

      <FieldSet>
        <FieldLegend variant="label">Productos que usa</FieldLegend>
        <FieldDescription>
          Cada acceso ocupa un usuario de tu licencia. Sin licencia, no se puede activar.
        </FieldDescription>
        <div className="grid gap-3 sm:grid-cols-2">
          {uso.map((u) => {
            const marcada = colaborador?.[COLUMNA[u.producto]] ?? false;
            return (
              <Casilla
                key={u.producto}
                nombre={COLUMNA[u.producto]}
                etiqueta={u.nombre}
                descripcion={
                  !u.licenciado
                    ? "No está en tu licencia"
                    : u.licenciados === null
                      ? "Incluido en tu licencia"
                      : `${u.enUso} de ${u.licenciados} en uso`
                }
                marcada={marcada}
                deshabilitada={!u.licenciado && !marcada}
              />
            );
          })}
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Administración de STLic</FieldLegend>
        <FieldDescription>
          {puedeDarPermisos
            ? "Con algún permiso, recibe un mail para entrar a STLic."
            : "Solo un administrador general puede cambiar estos permisos."}
        </FieldDescription>
        <div className="grid gap-3">
          {PERMISOS.map((p) => (
            <Casilla
              key={p.campo}
              nombre={p.campo}
              etiqueta={p.etiqueta}
              descripcion={p.descripcion}
              marcada={colaborador?.[p.campo] ?? false}
              deshabilitada={!puedeDarPermisos}
            />
          ))}
        </div>
      </FieldSet>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>{colaborador ? "Guardar cambios" : "Crear usuario"}</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function DialogoColaborador({
  colaborador,
  disparador,
  ...props
}: {
  colaborador?: DatosColaborador;
  alcances: OpcionAlcance[];
  uso: UsoAcceso[];
  puedeDarPermisos: boolean;
  disparador: ReactElement;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={disparador} />
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {colaborador ? `Editar a ${colaborador.nombre}` : "Nuevo usuario"}
          </DialogTitle>
          <DialogDescription>
            Personas que usan los productos de la empresa y, si les das permisos, administran la
            cuenta en STLic.
          </DialogDescription>
        </DialogHeader>
        {abierto && (
          <ContenidoColaborador
            colaborador={colaborador}
            cerrar={() => setAbierto(false)}
            {...props}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BotonNuevoColaborador(
  props: Omit<Parameters<typeof DialogoColaborador>[0], "disparador" | "colaborador">,
) {
  return (
    <DialogoColaborador
      {...props}
      disparador={
        <Button size="lg">
          <UserPlus data-icon="inline-start" /> Nuevo usuario
        </Button>
      }
    />
  );
}

export function BotonEditarColaborador(
  props: Omit<Parameters<typeof DialogoColaborador>[0], "disparador"> & {
    colaborador: DatosColaborador;
  },
) {
  return (
    <DialogoColaborador
      {...props}
      disparador={
        <Button variant="ghost" size="sm" aria-label={`Editar a ${props.colaborador.nombre}`}>
          <Pencil data-icon="inline-start" /> Editar
        </Button>
      }
    />
  );
}

export function CambiarEstadoColaborador({
  id,
  nombre,
  activo,
}: {
  id: string;
  nombre: string;
  activo: boolean;
}) {
  const [estado, accion, enviando] = useActionState(cambiarEstadoColaboradorAccion, ESTADO_INICIAL);
  useAvisoDeAccion(estado);
  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={String(!activo)} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={enviando}
        aria-label={`${activo ? "Dar de baja" : "Reactivar"} a ${nombre}`}
      >
        {activo ? <PowerOff data-icon="inline-start" /> : <Power data-icon="inline-start" />}
        {activo ? "Dar de baja" : "Reactivar"}
      </Button>
    </form>
  );
}

export function ReenviarAcceso({ id }: { id: string }) {
  const [estado, accion, enviando] = useActionState(
    reenviarInvitacionColaboradorAccion,
    ESTADO_INICIAL,
  );
  useAvisoDeAccion(estado);
  return (
    <form action={accion}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={enviando}>
        <Send data-icon="inline-start" /> Reenviar acceso
      </Button>
    </form>
  );
}
