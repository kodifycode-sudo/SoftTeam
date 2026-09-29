"use client";

import { PackageX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BotonEnviar } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL } from "@/lib/formulario";
import { bajaContratoAccion } from "./acciones";

export interface PaqueteVigente {
  id: string;
  paquete: string;
  cantidad: number;
  estado: "ACTIVO" | "PEND_PAGO_ACTIVO";
  hasta: string | null;
  /** "Hasta el 31/10/2026" o "Hasta agotar el saldo". */
  vigencia: string;
}

function DarDeBaja({ paquete, clienteId }: { paquete: PaqueteVigente; clienteId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La fila desaparece en la misma actualización: el aviso sale desde el envío.
  async function bajar(datos: FormData) {
    const r = await bajaContratoAccion(ESTADO_INICIAL, datos);
    if (r.ok) {
      toast.success(r.mensaje);
      setAbierto(false);
    } else {
      setError(r.errores?.motivo?.[0] ?? r.mensaje ?? "No se pudo dar de baja.");
    }
  }
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" aria-label={`Dar de baja ${paquete.paquete}`} />}
      >
        <PackageX data-icon="inline-start" /> Dar de baja
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>¿Dar de baja {paquete.paquete}?</DialogTitle>
          <DialogDescription>
            Deja de contar para la licencia en el acto y no se renueva. Si corresponde devolver
            dinero, se resuelve aparte.
          </DialogDescription>
        </DialogHeader>
        <form action={bajar} className="space-y-4">
          <input type="hidden" name="contratoId" value={paquete.id} />
          <input type="hidden" name="clienteId" value={clienteId} />
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={`motivo-${paquete.id}`}>Motivo</FieldLabel>
            <Textarea id={`motivo-${paquete.id}`} name="motivo" rows={3} maxLength={300} required />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancelar</DialogClose>
            <BotonEnviar variant="destructive">Dar de baja</BotonEnviar>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Paquetes vigentes de una empresa; Administración puede dar de baja uno. */
export function PaquetesVigentes({
  paquetes,
  clienteId,
  administracion,
}: {
  paquetes: PaqueteVigente[];
  clienteId: string;
  administracion: boolean;
}) {
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">Paquetes vigentes</p>
      {paquetes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin paquetes vigentes.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {paquetes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {p.paquete}
                  {p.cantidad > 1 && <span className="text-muted-foreground"> ×{p.cantidad}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{p.vigencia}</p>
              </div>
              <div className="flex items-center gap-2">
                {p.estado === "PEND_PAGO_ACTIVO" && (
                  <Badge variant="outline">Pendiente de pago</Badge>
                )}
                {administracion && p.estado === "ACTIVO" && (
                  <DarDeBaja paquete={p} clienteId={clienteId} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
