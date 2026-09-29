"use client";

import { Plus, Search } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { BotonEnviar, useAvisoDeAccion } from "@/components/formulario";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { agregarAseguradorasAccion } from "./acciones";

export interface AseguradoraDisponible {
  id: string;
  nombre: string;
  abreviatura: string;
  prodigal: boolean;
  cotiweb: boolean;
}

function Contenido({
  disponibles,
  licencias,
  cerrar,
}: {
  disponibles: AseguradoraDisponible[];
  licencias: { prodigal: boolean; cotiweb: boolean };
  cerrar: () => void;
}) {
  const [estado, accion] = useActionState(agregarAseguradorasAccion, ESTADO_INICIAL);
  const [filtro, setFiltro] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return disponibles.filter(
      (a) => !f || a.nombre.toLowerCase().includes(f) || a.abreviatura.toLowerCase().includes(f),
    );
  }, [disponibles, filtro]);
  const todasVisibles = visibles.length > 0 && visibles.every((a) => elegidas.has(a.id));

  useAvisoDeAccion(estado, cerrar);

  const alternar = (id: string) =>
    setElegidas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  return (
    <form action={accion} className="space-y-4">
      {[...elegidas].map((id) => (
        <input key={id} type="hidden" name="aseguradoraIds" value={id} />
      ))}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar en el catálogo"
          aria-label="Buscar en el catálogo"
          className="pl-9"
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <Field orientation="horizontal" className="w-auto">
          <Checkbox
            id="elegir-todas"
            checked={todasVisibles}
            onCheckedChange={(marcada) =>
              setElegidas((actual) => {
                const nuevo = new Set(actual);
                for (const a of visibles) {
                  if (marcada) nuevo.add(a.id);
                  else nuevo.delete(a.id);
                }
                return nuevo;
              })
            }
          />
          <FieldLabel htmlFor="elegir-todas" className="font-normal">
            Elegir todas{filtro ? " las encontradas" : ""}
          </FieldLabel>
        </Field>
        <span className="text-muted-foreground tabular-nums">
          {elegidas.size} elegida{elegidas.size === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
        {visibles.length === 0 && (
          <li className="p-3 text-sm text-muted-foreground">
            {disponibles.length === 0
              ? "Ya trabajás con todas las aseguradoras del catálogo."
              : "No hay aseguradoras con ese nombre."}
          </li>
        )}
        {visibles.map((a) => (
          <li key={a.id}>
            <Field orientation="horizontal" className="px-3 py-2.5 hover:bg-muted/50">
              <Checkbox
                id={`elegir-${a.id}`}
                checked={elegidas.has(a.id)}
                onCheckedChange={() => alternar(a.id)}
              />
              <FieldLabel htmlFor={`elegir-${a.id}`} className="flex-1 font-normal">
                <span className="font-medium">{a.nombre}</span>{" "}
                <span className="font-mono text-xs text-muted-foreground">{a.abreviatura}</span>
              </FieldLabel>
            </Field>
          </li>
        ))}
      </ul>
      <fieldset className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <legend className="px-1 text-sm font-medium">Activar también sus interfaces</legend>
        {(["prodigal", "cotiweb"] as const).map((tipo) => (
          <Field key={tipo} orientation="horizontal" data-disabled={!licencias[tipo] || undefined}>
            <Checkbox id={`activar-${tipo}`} name={tipo} value="on" disabled={!licencias[tipo]} />
            <FieldLabel htmlFor={`activar-${tipo}`} className="font-normal">
              Interfaz con {tipo === "prodigal" ? "Prodigal" : "CotiWeb"}
              {!licencias[tipo] && " (no incluida en tu licencia)"}
            </FieldLabel>
          </Field>
        ))}
        <p className="text-xs text-muted-foreground">
          Solo en las que la tienen disponible, y hasta lo que incluye tu licencia.
        </p>
      </fieldset>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
        <BotonEnviar disabled={elegidas.size === 0}>
          Agregar {elegidas.size > 0 ? elegidas.size : ""}
        </BotonEnviar>
      </DialogFooter>
    </form>
  );
}

/** Elegir una o varias aseguradoras del catálogo para trabajar con ellas. */
export function AgregarAseguradoras(props: {
  disponibles: AseguradoraDisponible[];
  licencias: { prodigal: boolean; cotiweb: boolean };
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={<Button size="lg" />}>
        <Plus data-icon="inline-start" /> Agregar aseguradoras
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar aseguradoras</DialogTitle>
          <DialogDescription>
            Elegí del catálogo una o varias compañías con las que trabaja la empresa. ¿Falta alguna?
            Pedile a Soporte SOFTeam que la sume al catálogo.
          </DialogDescription>
        </DialogHeader>
        {abierto && <Contenido {...props} cerrar={() => setAbierto(false)} />}
      </DialogContent>
    </Dialog>
  );
}
