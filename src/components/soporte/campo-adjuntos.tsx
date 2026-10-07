"use client";

import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const MAXIMO_POR_ARCHIVO = 2 * 1024 * 1024;

function tamano(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}

/**
 * Adjuntos de un mensaje de soporte. El input de archivos sigue siendo el del
 * formulario (viaja en el FormData y conserva su etiqueta), pero oculto: se
 * elige con un botón propio y se ve la lista de lo elegido. El servidor los
 * valida por su contenido; acá solo se avisa lo que ya se sabe que no pasa.
 */
export function CampoAdjuntos({ id, errores }: { id: string; errores?: string[] }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);

  // React reinicia el formulario al terminar una acción: la lista se vacía con el input.
  useEffect(() => {
    const formulario = entrada.current?.form;
    if (!formulario) return;
    const vaciar = () => setArchivos([]);
    formulario.addEventListener("reset", vaciar);
    return () => formulario.removeEventListener("reset", vaciar);
  }, []);

  const quitar = (indice: number) => {
    const input = entrada.current;
    if (!input) return;
    const quedan = new DataTransfer();
    archivos.forEach((archivo, i) => {
      if (i !== indice) quedan.items.add(archivo);
    });
    input.files = quedan.files;
    setArchivos([...quedan.files]);
  };

  return (
    <Field data-invalid={errores ? true : undefined}>
      <FieldLabel htmlFor={id} className="flex items-center gap-1.5">
        <Paperclip className="size-3.5" /> Adjuntos (opcional)
      </FieldLabel>
      <input
        ref={entrada}
        id={id}
        name="adjuntos"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,application/pdf"
        aria-invalid={errores ? true : undefined}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => setArchivos([...(e.currentTarget.files ?? [])])}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => entrada.current?.click()}
          aria-controls={id}
        >
          <Paperclip data-icon="inline-start" />
          {archivos.length ? "Cambiar archivos" : "Elegir archivos"}
        </Button>
        {archivos.length === 0 && (
          <span className="text-xs text-muted-foreground">Ningún archivo elegido</span>
        )}
      </div>
      {archivos.length > 0 && (
        <ul className="space-y-1.5">
          {archivos.map((archivo, i) => {
            const Icono = archivo.type === "application/pdf" ? FileText : ImageIcon;
            const pesado = archivo.size > MAXIMO_POR_ARCHIVO;
            return (
              <li
                key={`${archivo.name}-${archivo.size}-${archivo.lastModified}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-sm",
                  pesado && "border-destructive/50 bg-destructive/5",
                )}
              >
                <Icono className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{archivo.name}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    pesado ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {tamano(archivo.size)}
                  {pesado && " · supera 2 MB"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => quitar(i)}
                  aria-label={`Quitar ${archivo.name}`}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <FieldDescription>
        Capturas de pantalla o PDF: hasta 3 archivos de 2 MB (3,5 MB entre todos).
      </FieldDescription>
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}
