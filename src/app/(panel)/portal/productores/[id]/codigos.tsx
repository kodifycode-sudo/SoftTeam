"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { BotonEnviar, Campo, useAvisoDeAccion } from "@/components/formulario";
import { SelectNativo } from "@/components/select-nativo";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { agregarCodigoAccion } from "../acciones";

export function AgregarCodigo({
  productorId,
  aseguradoras,
  roles,
}: {
  productorId: string;
  aseguradoras: { id: string; nombre: string }[];
  roles: { valor: "PRODUCTOR" | "ORGANIZADOR"; etiqueta: string }[];
}) {
  const [estado, accion] = useActionState(agregarCodigoAccion, ESTADO_INICIAL);
  const formulario = useRef<HTMLFormElement>(null);
  useAvisoDeAccion(estado);
  // Después de agregar, el formulario queda listo para el siguiente código.
  useEffect(() => {
    if (estado.ok) formulario.current?.reset();
  }, [estado]);
  const error = (campo: string) => estado.errores?.[campo]?.map((message) => ({ message }));

  return (
    <form
      ref={formulario}
      action={accion}
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] sm:items-start"
    >
      <input type="hidden" name="productorId" value={productorId} />
      <Field data-invalid={error("aseguradoraId") ? true : undefined}>
        <FieldLabel htmlFor="aseguradoraId">Aseguradora</FieldLabel>
        <SelectNativo
          id="aseguradoraId"
          name="aseguradoraId"
          key={estado.ok ? "limpio" : (estado.valores?.aseguradoraId ?? "")}
          defaultValue={estado.ok ? "" : (estado.valores?.aseguradoraId ?? "")}
        >
          <option value="" disabled>
            Elegí…
          </option>
          {aseguradoras.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </SelectNativo>
        <FieldError errors={error("aseguradoraId")} />
      </Field>
      <Campo nombre="codigo" etiqueta="Código" estado={estado.ok ? ESTADO_INICIAL : estado} />
      <Field data-invalid={error("rol") ? true : undefined}>
        <FieldLabel htmlFor="rol">Rol</FieldLabel>
        <SelectNativo id="rol" name="rol" defaultValue={roles[0]?.valor}>
          {roles.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.etiqueta}
            </option>
          ))}
        </SelectNativo>
        <FieldError errors={error("rol")} />
      </Field>
      <BotonEnviar className="sm:mt-6">
        <Plus data-icon="inline-start" /> Agregar
      </BotonEnviar>
    </form>
  );
}
