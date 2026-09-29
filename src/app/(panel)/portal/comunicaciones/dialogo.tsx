"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
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
  LISTA_TIPOS_USUARIO,
  MEDIOS_COMUNICACION,
  type MedioComunicacion,
  type MediosComunicacion,
  type ReglaComunicacion,
  TIPOS_USUARIO,
  type TipoUsuario,
} from "@/domain/comunicaciones/tipos";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { cn } from "@/lib/utils";
import { guardarTipoComunicacionAccion } from "./acciones";

export interface DatosTipoComunicacion {
  id: string;
  nombre: string;
  medios: MediosComunicacion;
  reglas: ReglaComunicacion[];
  activo: boolean;
}

/** Tipos de usuario como botones que se prenden y apagan. */
function Seleccion({
  etiqueta,
  valor,
  cambiar,
}: {
  etiqueta: string;
  valor: TipoUsuario[];
  cambiar: (valor: TipoUsuario[]) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs text-muted-foreground">{etiqueta}</legend>
      <div className="flex flex-wrap gap-1.5">
        {LISTA_TIPOS_USUARIO.map((tipo) => {
          const activo = valor.includes(tipo);
          return (
            <button
              key={tipo}
              type="button"
              aria-pressed={activo}
              onClick={() => cambiar(activo ? valor.filter((v) => v !== tipo) : [...valor, tipo])}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                activo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted",
              )}
            >
              {TIPOS_USUARIO[tipo].etiqueta}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function EditorReglas({
  reglas,
  cambiar,
  errores,
}: {
  reglas: ReglaComunicacion[];
  cambiar: (reglas: ReglaComunicacion[]) => void;
  errores?: string[];
}) {
  const libres = LISTA_TIPOS_USUARIO.filter((t) => !reglas.some((r) => r.origen === t));
  const actualizar = (i: number, cambio: Partial<ReglaComunicacion>) =>
    cambiar(reglas.map((r, j) => (j === i ? { ...r, ...cambio } : r)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Quién la origina, a quién llega y quién autoriza</p>
        {libres[0] && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              cambiar([
                ...reglas,
                { origen: libres[0] as TipoUsuario, destinos: [], autorizantes: [] },
              ])
            }
          >
            <Plus data-icon="inline-start" /> Agregar origen
          </Button>
        )}
      </div>
      {reglas.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Todavía no hay orígenes.
        </p>
      )}
      {reglas.map((regla, i) => (
        <div key={regla.origen} className="space-y-3 rounded-xl border bg-muted/30 p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label htmlFor={`origen-${i}`} className="text-xs text-muted-foreground">
                La origina
              </label>
              <SelectNativo
                id={`origen-${i}`}
                value={regla.origen}
                onChange={(e) => actualizar(i, { origen: e.target.value as TipoUsuario })}
              >
                {LISTA_TIPOS_USUARIO.filter(
                  (t) => t === regla.origen || !reglas.some((r) => r.origen === t),
                ).map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_USUARIO[t].etiqueta}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Quitar el origen ${TIPOS_USUARIO[regla.origen].etiqueta}`}
              onClick={() => cambiar(reglas.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
          <Seleccion
            etiqueta="Llega a"
            valor={regla.destinos}
            cambiar={(destinos) => actualizar(i, { destinos })}
          />
          <Seleccion
            etiqueta="La autoriza (opcional)"
            valor={regla.autorizantes}
            cambiar={(autorizantes) => actualizar(i, { autorizantes })}
          />
        </div>
      ))}
      {errores?.map((e) => (
        <p key={e} className="text-sm text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}

const SIN_MEDIOS = Object.fromEntries(
  Object.keys(MEDIOS_COMUNICACION).map((m) => [m, false]),
) as MediosComunicacion;

function Contenido({ tipo, cerrar }: { tipo?: DatosTipoComunicacion; cerrar: () => void }) {
  const [estado, accion] = useActionState(guardarTipoComunicacionAccion, ESTADO_INICIAL);
  const [reglas, setReglas] = useState<ReglaComunicacion[]>(tipo?.reglas ?? []);
  useAvisoDeAccion(estado, cerrar);
  const medios = tipo?.medios ?? SIN_MEDIOS;
  const sufijo = tipo?.id ?? "nuevo";
  return (
    <FormularioConservado accion={accion} className="space-y-5" noValidate>
      {tipo && <input type="hidden" name="id" value={tipo.id} />}
      <input type="hidden" name="reglas" value={JSON.stringify(reglas)} />
      {!estado.ok && <MensajeFormulario estado={estado} />}
      <Campo
        nombre="nombre"
        etiqueta="Nombre"
        placeholder="Vencimiento de póliza"
        defaultValue={tipo?.nombre ?? ""}
        estado={estado}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Medios</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(MEDIOS_COMUNICACION) as MedioComunicacion[]).map((m) => (
            <Casilla
              key={m}
              id={`medio-${m}-${sufijo}`}
              nombre={`medio-${m}`}
              etiqueta={MEDIOS_COMUNICACION[m]}
              marcada={medios[m]}
            />
          ))}
        </div>
        {estado.errores?.medios?.map((e) => (
          <p key={e} className="text-sm text-destructive">
            {e}
          </p>
        ))}
      </fieldset>
      <EditorReglas reglas={reglas} cambiar={setReglas} errores={estado.errores?.reglas} />
      <Casilla
        id={`activo-${sufijo}`}
        nombre="activo"
        etiqueta="Activo"
        descripcion="Uno inactivo no se usa en los productos, pero se conserva."
        marcada={tipo?.activo ?? true}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar>{tipo ? "Guardar" : "Crear"}</BotonEnviar>
      </DialogFooter>
    </FormularioConservado>
  );
}

export function DialogoTipoComunicacion({ tipo }: { tipo?: DatosTipoComunicacion }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {tipo ? (
        <DialogTrigger
          render={<Button variant="ghost" size="sm" aria-label={`Editar ${tipo.nombre}`} />}
        >
          <Pencil data-icon="inline-start" /> Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <Plus data-icon="inline-start" /> Nuevo tipo
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tipo ? tipo.nombre : "Nuevo tipo de comunicación"}</DialogTitle>
          <DialogDescription>
            Por qué medios sale y, según quién la origina, a quiénes llega y quién la autoriza.
            BienSeguro y el Boletín lo aplican al enviar.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido tipo={tipo} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
