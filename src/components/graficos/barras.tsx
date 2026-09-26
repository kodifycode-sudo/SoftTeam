import { cn } from "@/lib/utils";

export interface SerieBarras {
  nombre: string;
  /** Clase de color de fondo ("bg-primary"). */
  clase: string;
}

export interface GrupoBarras {
  etiqueta: string;
  valores: number[];
}

/**
 * Barras verticales agrupadas, sin librerías. Es un resumen visual: los datos
 * exactos están en la tabla que lo acompaña, así que para lectores de
 * pantalla alcanza con la descripción.
 */
export function GraficoBarras({
  grupos,
  series,
  descripcion,
  formato = (v) => String(v),
  className,
}: {
  grupos: GrupoBarras[];
  series: SerieBarras[];
  descripcion: string;
  formato?: (valor: number) => string;
  className?: string;
}) {
  const maximo = Math.max(1, ...grupos.flatMap((g) => g.valores));
  return (
    <figure className={cn("space-y-3", className)}>
      <div role="img" aria-label={descripcion} className="flex h-44 items-end gap-2 sm:gap-3">
        {grupos.map((g) => (
          <div key={g.etiqueta} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div className="flex h-full items-end justify-center gap-0.5">
              {g.valores.map((v, i) => (
                <div
                  key={series[i]?.nombre ?? i}
                  title={`${series[i]?.nombre}: ${formato(v)}`}
                  className={cn(
                    "w-full max-w-5 rounded-t-sm transition-all",
                    series[i]?.clase ?? "bg-primary",
                  )}
                  style={{ height: `${v > 0 ? Math.max((v / maximo) * 100, 2) : 0}%` }}
                />
              ))}
            </div>
            <span className="truncate text-center text-[0.65rem] text-muted-foreground">
              {g.etiqueta}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.nombre} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", s.clase)} /> {s.nombre}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
