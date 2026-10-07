import { ArrowDown, ArrowUp, type LucideIcon, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONOS = {
  primario: "bg-primary/10 text-primary",
  marca: "bg-brand/20 text-[oklch(0.5_0.13_75)] dark:text-brand",
  exito: "bg-success/10 text-success",
  alerta: "bg-warning/15 text-[oklch(0.5_0.13_70)] dark:text-warning",
} as const;

export interface VariacionIndicador {
  sentido: "sube" | "baja" | "igual";
  /** "+12 %", "+3", "Sin cambios". */
  texto: string;
  /** Contra qué se compara: "vs. 1–6 sept". */
  periodo: string;
}

export interface TendenciaIndicador {
  /** Valores en orden, el actual al final (solo para dibujar). */
  valores: number[];
  /** Texto de cada barra para el tooltip ("sept: $ 60.000"). */
  etiquetas: string[];
  /** Resumen para lectores de pantalla. */
  descripcion: string;
}

/** Subir es bueno en estos indicadores: verde si sube, rojo si baja. */
function Variacion({ variacion }: { variacion: VariacionIndicador }) {
  const Icono =
    variacion.sentido === "sube" ? ArrowUp : variacion.sentido === "baja" ? ArrowDown : Minus;
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold tabular-nums",
          variacion.sentido === "sube" && "text-success",
          variacion.sentido === "baja" && "text-destructive",
          variacion.sentido === "igual" && "text-muted-foreground",
        )}
      >
        <Icono className="size-3.5" aria-hidden />
        {variacion.texto}
      </span>
      <span className="text-muted-foreground">{variacion.periodo}</span>
    </p>
  );
}

/**
 * Mini serie de columnas: el pasado en tono neutro y el período actual
 * resaltado. Es un resumen; los datos exactos están en Reportes.
 */
function MiniSerie({ tendencia }: { tendencia: TendenciaIndicador }) {
  const maximo = Math.max(1, ...tendencia.valores);
  const ultimo = tendencia.valores.length - 1;
  return (
    <div role="img" aria-label={tendencia.descripcion} className="flex h-8 items-end gap-0.5">
      {tendencia.valores.map((v, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: posiciones fijas de la serie.
          key={i}
          title={tendencia.etiquetas[i]}
          className="flex h-full flex-1 items-end rounded-sm transition-colors hover:bg-muted"
        >
          <div
            className={cn(
              "w-full rounded-t-[3px]",
              i === ultimo ? "bg-primary" : "bg-muted-foreground/25",
            )}
            // Un período sin movimiento se ve como una línea de base, no como un hueco.
            style={{ height: v > 0 ? `${Math.max((v / maximo) * 100, 8)}%` : "2px" }}
          />
        </div>
      ))}
    </div>
  );
}

/** Tarjeta de indicador (KPI) para tableros, con variación y tendencia opcionales. */
export function Indicador({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono = "primario",
  variacion,
  tendencia,
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  icono: LucideIcon;
  tono?: keyof typeof TONOS;
  variacion?: VariacionIndicador;
  tendencia?: TendenciaIndicador;
}) {
  return (
    <Card className="gap-3 p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONOS[tono])}>
          <Icono className="size-[18px]" />
        </span>
      </div>
      <p className="text-3xl font-semibold tracking-tight">{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      {variacion && <Variacion variacion={variacion} />}
      {tendencia && (
        <div className="mt-auto pt-1">
          <MiniSerie tendencia={tendencia} />
        </div>
      )}
    </Card>
  );
}
