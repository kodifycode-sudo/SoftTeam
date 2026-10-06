"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@/components/ui/chart";
import { numero, pesos } from "@/lib/formato";
import { cn } from "@/lib/utils";

export interface SerieBarras {
  nombre: string;
  /** Color de la serie: un token de gráfico ("var(--chart-1)"), en el orden fijo 1, 2, 3… */
  color: string;
}

export interface GrupoBarras {
  /** Texto del eje ("sep", "Ene 26"). */
  etiqueta: string;
  /** Título del tooltip; si falta, se usa la etiqueta. */
  detalle?: string;
  valores: number[];
}

/** Cómo se muestran los valores: pesos (con decimales) o cantidades. */
export type UnidadGrafico = "pesos" | "numero";

const COMPACTO = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

function formatear(valor: number, unidad: UnidadGrafico): string {
  return unidad === "pesos" ? pesos(BigInt(Math.round(valor * 100))) : numero(valor);
}

function formatearEje(valor: number, unidad: UnidadGrafico): string {
  return unidad === "pesos" ? `$ ${COMPACTO.format(valor)}` : COMPACTO.format(valor);
}

interface EntradaTooltip {
  dataKey?: unknown;
  value?: unknown;
  color?: string;
  payload?: { detalle?: string };
}

/** Tooltip: el valor manda y el nombre de la serie acompaña, con una línea de color como clave. */
function ContenidoTooltip({
  active,
  payload,
  config,
  unidad,
}: {
  active?: boolean;
  payload?: readonly EntradaTooltip[];
  config: ChartConfig;
  unidad: UnidadGrafico;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-40 gap-2 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <p className="font-medium capitalize">{payload[0]?.payload?.detalle}</p>
      <ul className="grid gap-1.5">
        {payload.map((entrada) => {
          const clave = String(entrada.dataKey);
          return (
            <li key={clave} className="flex items-center gap-2">
              <span
                className="h-3 w-1 shrink-0 rounded-full"
                style={{ background: entrada.color }}
              />
              <span className="text-muted-foreground">{config[clave]?.label}</span>
              <span className="ml-auto pl-3 font-semibold tabular-nums">
                {formatear(Number(entrada.value), unidad)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Columnas agrupadas por categoría (meses) con tooltip y leyenda. Es un
 * resumen visual: los datos exactos están en la tabla que lo acompaña.
 */
export function GraficoBarras({
  grupos,
  series,
  descripcion,
  unidad = "numero",
  className,
}: {
  grupos: GrupoBarras[];
  series: SerieBarras[];
  descripcion: string;
  unidad?: UnidadGrafico;
  className?: string;
}) {
  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [`s${i}`, { label: s.nombre, color: s.color }]),
  );
  const datos = grupos.map((g) => ({
    etiqueta: g.etiqueta,
    detalle: g.detalle ?? g.etiqueta,
    ...Object.fromEntries(g.valores.map((v, i) => [`s${i}`, v])),
  }));

  return (
    <figure aria-label={descripcion} className={cn("w-full", className)}>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <BarChart data={datos} barGap={2} margin={{ top: 8, right: 4, left: 4 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={unidad === "pesos" ? 64 : 40}
            tickCount={5}
            allowDecimals={false}
            tickFormatter={(v: number) => formatearEje(v, unidad)}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => (
              <ContenidoTooltip
                active={active}
                payload={payload as readonly EntradaTooltip[]}
                config={config}
                unidad={unidad}
              />
            )}
          />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s, i) => (
            <Bar
              key={s.nombre}
              dataKey={`s${i}`}
              fill={`var(--color-s${i})`}
              radius={[4, 4, 0, 0]}
              barSize={24}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </figure>
  );
}
