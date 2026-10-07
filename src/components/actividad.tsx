import { History } from "lucide-react";
import Link from "next/link";
import { accionLegible, ENTIDADES_AUDITORIA, nombreDe } from "@/lib/auditoria";
import type { Actividad } from "@/server/modules/cuentas/actividad";

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

/** Histórico de actividad de una empresa (lo último primero). */
export function ListaActividad({ actividad }: { actividad: Actividad[] }) {
  if (actividad.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <History className="size-4" /> Todavía no hay actividad registrada.
      </p>
    );
  }
  return (
    <ol className="space-y-3 border-l pl-4">
      {actividad.map((a) => {
        const nombre = a.objeto?.texto ?? nombreDe(a.antes, a.despues);
        return (
          <li key={a.id} className="relative text-sm">
            <span
              className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary/60"
              aria-hidden
            />
            <p>
              <span className="font-medium">{accionLegible(a.accion)}</span>{" "}
              <span className="text-muted-foreground">
                · {ENTIDADES_AUDITORIA[a.entidad] ?? a.entidad}
                {nombre && ": "}
                {nombre &&
                  (a.objeto?.href ? (
                    <Link
                      href={a.objeto.href}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      {nombre}
                    </Link>
                  ) : (
                    <span className="text-foreground">{nombre}</span>
                  ))}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {a.actor} · {fechaHora(a.en)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
