import { Paperclip } from "lucide-react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Adjuntos de un mensaje de soporte (se validan en el servidor por su contenido). */
export function CampoAdjuntos({ id, errores }: { id: string; errores?: string[] }) {
  return (
    <Field data-invalid={errores ? true : undefined}>
      <FieldLabel htmlFor={id} className="flex items-center gap-1.5">
        <Paperclip className="size-3.5" /> Adjuntos (opcional)
      </FieldLabel>
      <Input
        id={id}
        name="adjuntos"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,application/pdf"
        aria-invalid={errores ? true : undefined}
      />
      <FieldDescription>
        Capturas de pantalla o PDF: hasta 3 archivos de 2 MB (3,5 MB entre todos).
      </FieldDescription>
      <FieldError errors={errores?.map((message) => ({ message }))} />
    </Field>
  );
}
