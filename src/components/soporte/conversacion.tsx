import { Headset, Lock, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ESTADOS_INCIDENTE = {
  ABIERTO: { etiqueta: "Abierto", clase: "border-primary/40 bg-primary/5 text-primary" },
  EN_CURSO: { etiqueta: "En curso", clase: "border-primary/40 text-primary" },
  ESPERANDO_CLIENTE: {
    etiqueta: "Respondido",
    clase: "border-warning/60 bg-warning/10 text-[oklch(0.45_0.12_70)]",
  },
  RESUELTO: { etiqueta: "Resuelto", clase: "border-success/40 bg-success/10 text-success" },
  CERRADO: { etiqueta: "Cerrado", clase: "text-muted-foreground" },
} as const;

export const PRIORIDADES = {
  ALTA: { etiqueta: "Alta", clase: "border-destructive/40 bg-destructive/5 text-destructive" },
  MEDIA: { etiqueta: "Media", clase: "" },
  BAJA: { etiqueta: "Baja", clase: "text-muted-foreground" },
} as const;

export function EstadoIncidente({ estado }: { estado: keyof typeof ESTADOS_INCIDENTE }) {
  const e = ESTADOS_INCIDENTE[estado];
  return (
    <Badge variant="outline" className={e.clase}>
      {e.etiqueta}
    </Badge>
  );
}

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

export interface MensajeConversacion {
  id: string;
  texto: string;
  deSofteam: boolean;
  interno: boolean;
  creadoEn: Date;
  autor: string;
}

/**
 * Conversación de un pedido de soporte. Desde el lado de `vista`, los
 * mensajes propios van a la derecha. Las notas internas (solo SOFTeam) se
 * distinguen con otro fondo y un candado.
 */
export function Conversacion({
  mensajes,
  vista,
}: {
  mensajes: MensajeConversacion[];
  vista: "cliente" | "softeam";
}) {
  return (
    <ol className="space-y-4" aria-label="Conversación">
      {mensajes.map((m) => {
        const propio = vista === "softeam" ? m.deSofteam : !m.deSofteam;
        return (
          <li key={m.id} className={cn("flex gap-3", propio && "flex-row-reverse")}>
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full",
                m.deSofteam ? "bg-navy text-brand" : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              {m.deSofteam ? <Headset className="size-4" /> : <UserRound className="size-4" />}
            </span>
            <div className={cn("max-w-[85%] min-w-0 space-y-1", propio && "items-end text-right")}>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.deSofteam && vista === "cliente" ? "Soporte SOFTeam" : m.autor}
                </span>{" "}
                · {fechaHora(m.creadoEn)}
              </p>
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-left text-sm whitespace-pre-line",
                  m.interno
                    ? "border border-dashed border-warning/60 bg-warning/10"
                    : propio
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                )}
              >
                {m.interno && (
                  <p className="mb-1 flex items-center gap-1 text-xs font-medium text-[oklch(0.45_0.12_70)]">
                    <Lock className="size-3" /> Nota interna (el cliente no la ve)
                  </p>
                )}
                {m.texto}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
