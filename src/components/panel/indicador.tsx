import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONOS = {
  primario: "bg-primary/10 text-primary",
  marca: "bg-brand/20 text-[oklch(0.5_0.13_75)] dark:text-brand",
  exito: "bg-success/10 text-success",
  alerta: "bg-warning/15 text-[oklch(0.5_0.13_70)] dark:text-warning",
} as const;

/** Tarjeta de indicador (KPI) para tableros. */
export function Indicador({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono = "primario",
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  icono: LucideIcon;
  tono?: keyof typeof TONOS;
}) {
  return (
    <Card className="gap-3 p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONOS[tono])}>
          <Icono className="size-[18px]" />
        </span>
      </div>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
    </Card>
  );
}
