import { ArrowRight, Check, Rocket } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Paso } from "@/server/modules/cuentas/primeros-pasos";

const PASOS: {
  paso: Paso;
  titulo: string;
  detalle: string;
  href: string;
  permiso: "comercial" | "configuracion";
}[] = [
  {
    paso: "paquetes",
    titulo: "Elegí tus paquetes",
    detalle: "Los productos que vas a usar: gestión, cotización, portal, notificaciones.",
    href: "/portal/paquetes",
    permiso: "comercial",
  },
  {
    paso: "usuarios",
    titulo: "Cargá a tu equipo",
    detalle: "Quién usa cada producto y quién te ayuda a administrar la cuenta.",
    href: "/portal/usuarios",
    permiso: "configuracion",
  },
  {
    paso: "aseguradoras",
    titulo: "Marcá tus aseguradoras",
    detalle: "Con qué compañías trabajás y qué interfaces necesitás.",
    href: "/portal/aseguradoras",
    permiso: "configuracion",
  },
  {
    paso: "productores",
    titulo: "Sumá tus productores",
    detalle: "Con sus códigos en cada aseguradora.",
    href: "/portal/productores",
    permiso: "configuracion",
  },
  {
    paso: "marca",
    titulo: "Poné tu marca",
    detalle: "Tu logo y tus colores en lo que ven tus asegurados.",
    href: "/portal/marca",
    permiso: "configuracion",
  },
];

/**
 * Guía de primeros pasos: qué le falta a la empresa para aprovechar los
 * productos, con acceso directo a cada pantalla. Desaparece cuando está todo.
 */
export function PrimerosPasos({
  completados,
  permisos,
}: {
  completados: Record<Paso, boolean>;
  permisos: { comercial: boolean; configuracion: boolean };
}) {
  const pasos = PASOS.filter((p) => permisos[p.permiso]);
  const hechos = pasos.filter((p) => completados[p.paso]).length;
  if (pasos.length === 0 || hechos === pasos.length) return null;
  const siguiente = pasos.find((p) => !completados[p.paso]);

  return (
    <Card className="mb-8 gap-4 border-primary/20">
      <CardHeader className="flex flex-row items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Rocket className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle>Primeros pasos</CardTitle>
          <CardDescription>
            {hechos} de {pasos.length} listos. Completalos para aprovechar todo desde el primer día.
          </CardDescription>
          {/* biome-ignore lint/a11y/useSemanticElements: <meter> no se puede estilizar igual en todos los navegadores; el role conserva la semántica. */}
          <div
            role="meter"
            aria-label="Avance de los primeros pasos"
            aria-valuenow={hechos}
            aria-valuemin={0}
            aria-valuemax={pasos.length}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(hechos / pasos.length) * 100}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {pasos.map((p, i) => {
            const hecho = completados[p.paso];
            const esSiguiente = p === siguiente;
            return (
              <li key={p.paso}>
                <Link
                  href={p.href}
                  className={cn(
                    "group flex h-full items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50",
                    esSiguiente && "border-primary/40 bg-primary/5",
                    hecho && "opacity-70",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                      hecho
                        ? "border-success bg-success text-success-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {hecho ? <Check className="size-3.5" aria-label="Listo" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm font-medium", hecho && "line-through")}>
                      {p.titulo}
                    </span>
                    <span className="block text-xs text-muted-foreground">{p.detalle}</span>
                  </span>
                  {!hecho && (
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
