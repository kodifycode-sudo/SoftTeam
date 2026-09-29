"use client";

import { Pencil, Plus } from "lucide-react";
import { type ReactNode, useActionState, useState } from "react";
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
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";
import { guardarMonedaAccion, guardarPaisAccion, guardarProvinciaAccion } from "./acciones";

type Accion = (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>;

/** Diálogo de alta o edición: el formulario se monta al abrir (arranca limpio). */
function Dialogo({
  titulo,
  descripcion,
  editar,
  etiquetaNuevo,
  accion,
  campos,
}: {
  titulo: string;
  descripcion: string;
  /** Nombre de lo que se edita; sin él, es un alta. */
  editar?: string;
  etiquetaNuevo: string;
  accion: Accion;
  campos: (estado: EstadoFormulario) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {editar ? (
        <DialogTrigger
          render={<Button variant="ghost" size="sm" aria-label={`Editar ${editar}`} />}
        >
          <Pencil data-icon="inline-start" /> Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus data-icon="inline-start" /> {etiquetaNuevo}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        {abierto && <Formulario accion={accion} cerrar={() => setAbierto(false)} campos={campos} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({
  accion,
  cerrar,
  campos,
}: {
  accion: Accion;
  cerrar: () => void;
  campos: (estado: EstadoFormulario) => ReactNode;
}) {
  const [estado, enviar] = useActionState(accion, ESTADO_INICIAL);
  useAvisoDeAccion(estado, cerrar);
  return (
    <FormularioConservado accion={enviar} className="space-y-4" noValidate>
      {!estado.ok && <MensajeFormulario estado={estado} />}
      {campos(estado)}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>Guardar</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export interface DatosMoneda {
  codigo: string;
  nombre: string;
  simbolo: string;
  cotizacion: string;
  activa: boolean;
}

export function DialogoMoneda({ moneda }: { moneda?: DatosMoneda }) {
  return (
    <Dialogo
      titulo={moneda ? `${moneda.codigo} · ${moneda.nombre}` : "Nueva moneda"}
      descripcion="La cotización es cuántos pesos vale una unidad; el peso es la base y vale 1."
      editar={moneda?.codigo}
      etiquetaNuevo="Nueva moneda"
      accion={guardarMonedaAccion}
      campos={(estado) => (
        <>
          {moneda ? (
            <input type="hidden" name="codigo" value={moneda.codigo} />
          ) : (
            <Campo
              nombre="codigo"
              etiqueta="Código (ISO 4217)"
              placeholder="USD"
              maxLength={3}
              estado={estado}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Campo
              nombre="nombre"
              etiqueta="Nombre"
              defaultValue={moneda?.nombre}
              estado={estado}
            />
            <Campo
              nombre="simbolo"
              etiqueta="Símbolo"
              defaultValue={moneda?.simbolo}
              estado={estado}
            />
          </div>
          <Campo
            nombre="cotizacion"
            etiqueta="Cotización (pesos por unidad)"
            inputMode="decimal"
            defaultValue={moneda?.cotizacion}
            ayuda="Vacío si todavía no se usa."
            estado={estado}
          />
          <Casilla
            id={`moneda-activa-${moneda?.codigo ?? "nueva"}`}
            nombre="activa"
            etiqueta="Activa"
            marcada={moneda?.activa ?? true}
          />
        </>
      )}
    />
  );
}

export interface DatosPais {
  id: string;
  nombre: string;
  nombreCorto: string;
  prefijoTelefonico: string;
  moneda: string;
  alicuotaIvaGeneral: string;
  activo: boolean;
}

export function DialogoPais({ pais, monedas }: { pais?: DatosPais; monedas: string[] }) {
  return (
    <Dialogo
      titulo={pais ? pais.nombre : "Nuevo país"}
      descripcion="Define la moneda y el IVA con que se vende. Uno inactivo no se ofrece para clientes nuevos."
      editar={pais?.nombre}
      etiquetaNuevo="Nuevo país"
      accion={guardarPaisAccion}
      campos={(estado) => (
        <>
          {pais ? (
            <input type="hidden" name="id" value={pais.id} />
          ) : (
            <Campo
              nombre="id"
              etiqueta="Código (ISO 3166)"
              placeholder="UY"
              maxLength={2}
              estado={estado}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Campo nombre="nombre" etiqueta="Nombre" defaultValue={pais?.nombre} estado={estado} />
            <Campo
              nombre="nombreCorto"
              etiqueta="Nombre corto"
              defaultValue={pais?.nombreCorto}
              estado={estado}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo
              nombre="prefijoTelefonico"
              etiqueta="Prefijo telefónico"
              inputMode="numeric"
              defaultValue={pais?.prefijoTelefonico}
              estado={estado}
            />
            <Selector
              nombre="moneda"
              etiqueta="Moneda"
              estado={estado}
              valorInicial={pais?.moneda ?? monedas[0] ?? ""}
            >
              {monedas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Selector>
            <Campo
              nombre="alicuotaIvaGeneral"
              etiqueta="IVA general (%)"
              inputMode="decimal"
              defaultValue={pais?.alicuotaIvaGeneral}
              estado={estado}
            />
          </div>
          <Casilla
            id={`pais-activo-${pais?.id ?? "nuevo"}`}
            nombre="activo"
            etiqueta="Activo"
            marcada={pais?.activo ?? true}
          />
        </>
      )}
    />
  );
}

export interface DatosProvincia {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
}

export function DialogoProvincia({
  paisId,
  provincia,
}: {
  paisId: string;
  provincia?: DatosProvincia;
}) {
  return (
    <Dialogo
      titulo={provincia ? provincia.nombre : "Nueva provincia"}
      descripcion="Los domicilios guardan el nombre: una inactiva deja de ofrecerse, pero los domicilios que ya la usan la conservan."
      editar={provincia?.nombre}
      etiquetaNuevo="Nueva provincia"
      accion={guardarProvinciaAccion}
      campos={(estado) => (
        <>
          <input type="hidden" name="paisId" value={paisId} />
          {provincia && <input type="hidden" name="id" value={provincia.id} />}
          <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
            <Campo
              nombre="codigo"
              etiqueta="Código"
              maxLength={5}
              defaultValue={provincia?.codigo}
              estado={estado}
            />
            <Campo
              nombre="nombre"
              etiqueta="Nombre"
              defaultValue={provincia?.nombre}
              estado={estado}
            />
          </div>
          <Casilla
            id={`provincia-activa-${provincia?.id ?? "nueva"}`}
            nombre="activa"
            etiqueta="Activa"
            marcada={provincia?.activa ?? true}
          />
        </>
      )}
    />
  );
}
