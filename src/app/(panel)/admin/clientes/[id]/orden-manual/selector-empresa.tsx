"use client";

import { useRouter } from "next/navigation";
import { SelectNativo } from "@/components/select-nativo";
import { Field, FieldLabel } from "@/components/ui/field";

/** Empresa del cliente para la que se arma la orden. */
export function SelectorEmpresa({
  clienteId,
  empresas,
  actual,
}: {
  clienteId: string;
  empresas: { id: string; nombre: string }[];
  actual: string;
}) {
  const router = useRouter();
  return (
    <Field className="max-w-sm">
      <FieldLabel htmlFor="empresa">Empresa</FieldLabel>
      <SelectNativo
        id="empresa"
        value={actual}
        onChange={(e) =>
          router.push(`/admin/clientes/${clienteId}/orden-manual?empresa=${e.target.value}`)
        }
      >
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
          </option>
        ))}
      </SelectNativo>
    </Field>
  );
}
