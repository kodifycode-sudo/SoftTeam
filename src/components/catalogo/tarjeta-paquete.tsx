import { Check, Infinity as Infinito, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { numero, pesosRedondo } from "@/lib/formato";
import { productoUI } from "@/lib/productos";
import { cn } from "@/lib/utils";
import type { PaqueteListado } from "@/server/modules/catalogo/paquetes";

const MAX_LIMITES = 8;

function duracion(meses: number | null): string {
  if (meses === null) return "pago único";
  if (meses === 1) return "por mes";
  if (meses === 12) return "por año";
  return `cada ${meses} meses`;
}

/** Tarjeta de un paquete del catálogo: productos, límites y alternativas de precio. */
export function TarjetaPaquete({
  paquete,
  acciones,
  accionAlternativa,
  mostrarEstado = false,
}: {
  paquete: PaqueteListado;
  acciones?: ReactNode;
  /** Control por alternativa (por ejemplo, agregar al carrito en el portal). */
  accionAlternativa?: (alternativa: { id: string; nombre: string }) => ReactNode;
  mostrarEstado?: boolean;
}) {
  const alternativas = paquete.alternativas.filter((a) => a.activa);
  const limites = paquete.recursos.slice(0, MAX_LIMITES);
  const inactivo = mostrarEstado && !paquete.vendible;

  return (
    <Card
      className={cn("h-full gap-5 transition-shadow hover:shadow-lg", inactivo && "opacity-60")}
    >
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold leading-snug">{paquete.nombre}</h3>
            <p className="font-mono text-xs text-muted-foreground">{paquete.codigo}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge
              variant="outline"
              className={
                paquete.tipo === "TEMPORAL"
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-brand/50 bg-brand/15 text-[oklch(0.45_0.12_75)] dark:text-brand"
              }
            >
              {paquete.tipo === "TEMPORAL" ? "Temporal" : "Consumible"}
            </Badge>
            {mostrarEstado && (
              <Badge variant={paquete.vendible ? "secondary" : "outline"}>
                {paquete.vendible ? "A la venta" : "Inactivo"}
              </Badge>
            )}
            {paquete.privado && (
              <Badge variant="outline" className="gap-1">
                <Lock className="size-3" /> Privado
              </Badge>
            )}
          </div>
        </div>
        {paquete.descripcion && (
          <p className="text-sm text-muted-foreground">{paquete.descripcion}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {paquete.productos.map((id) => {
            const p = productoUI(id);
            return (
              <span
                key={id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
                  p.clase,
                )}
              >
                <p.icono className="size-3.5" /> {p.nombre}
              </span>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-5">
        <ul className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {limites.map((r) => (
            <li key={r.recursoId} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span className="min-w-0">
                {r.clase === "FUNCION" ? (
                  r.nombre
                ) : (
                  <>
                    <strong className="font-semibold tabular-nums">{numero(r.cantidad)}</strong>{" "}
                    <span className="text-muted-foreground">
                      {r.clase === "CUPO_MENSUAL"
                        ? `${r.unidad ?? ""} por mes`
                        : (r.unidad ?? r.nombre)}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
          {paquete.recursos.length > MAX_LIMITES && (
            <li className="text-xs text-muted-foreground">
              +{paquete.recursos.length - MAX_LIMITES} más
            </li>
          )}
        </ul>

        <div className="space-y-2">
          {alternativas.map((a) => (
            <div key={a.id} className="space-y-2.5 rounded-xl border bg-muted/30 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{a.nombre}</span>
                <span className="text-right">
                  <span className="text-base font-semibold tabular-nums">
                    {pesosRedondo(a.precioCompra)}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {a.meses === null ? <Infinito className="inline size-3" /> : null}{" "}
                    {duracion(a.meses)}
                  </span>
                  {a.precioRenovacion !== a.precioCompra && (
                    <span className="block text-xs text-muted-foreground">
                      Renovación {pesosRedondo(a.precioRenovacion)}
                    </span>
                  )}
                </span>
              </div>
              {accionAlternativa?.({ id: a.id, nombre: a.nombre })}
            </div>
          ))}
          <p className="text-[0.7rem] text-muted-foreground">Los precios no incluyen IVA.</p>
        </div>
      </CardContent>

      {acciones && <CardFooter className="flex-wrap gap-2 border-t">{acciones}</CardFooter>}
    </Card>
  );
}
