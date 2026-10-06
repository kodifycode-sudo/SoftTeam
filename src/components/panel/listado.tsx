import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { numero } from "@/lib/formato";
import {
  hrefListado,
  type Orden,
  type Pagina,
  type ParametrosUrl,
  paginasVisibles,
  siguienteOrden,
} from "@/lib/listados";
import { cn } from "@/lib/utils";

/** Encabezado de tabla que ordena el listado al hacer clic (y anuncia el orden actual). */
export function ColumnaOrdenable<C extends string>({
  columna,
  orden,
  base,
  parametros,
  className,
  alinear = "izquierda",
  children,
}: {
  columna: C;
  orden: Orden<C>;
  base: string;
  parametros: ParametrosUrl;
  className?: string;
  alinear?: "izquierda" | "centro" | "derecha";
  children: ReactNode;
}) {
  const activa = orden.columna === columna;
  const siguiente = siguienteOrden(orden, columna);
  const Icono = !activa ? ArrowUpDown : orden.direccion === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={activa ? (orden.direccion === "asc" ? "ascending" : "descending") : undefined}
    >
      <Link
        href={hrefListado(base, parametros, { orden: siguiente.columna, dir: siguiente.direccion })}
        scroll={false}
        className={cn(
          "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted",
          alinear === "centro" && "justify-center",
          alinear === "derecha" && "flex-row-reverse",
        )}
      >
        {children}
        <Icono
          className={cn("size-3.5", activa ? "text-primary" : "text-muted-foreground/60")}
          aria-hidden
        />
      </Link>
    </TableHead>
  );
}

/** Pie de listado: "26–50 de 312" y navegación entre páginas. */
export function Paginacion({
  pagina,
  total,
  base,
  parametros,
  nombre,
}: {
  pagina: Pagina;
  total: number;
  base: string;
  parametros: ParametrosUrl;
  /** Sustantivo en singular y plural para el resumen (["cliente", "clientes"]). */
  nombre: readonly [string, string];
}) {
  const paginas = Math.max(1, Math.ceil(total / pagina.tamano));
  const desde = total === 0 ? 0 : (pagina.numero - 1) * pagina.tamano + 1;
  const hasta = Math.min(total, pagina.numero * pagina.tamano);
  const href = (n: number) => hrefListado(base, parametros, { pagina: n });
  const boton = buttonVariants({ variant: "ghost", size: "icon-sm" });

  return (
    <nav
      aria-label="Paginación"
      className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        {desde === hasta ? numero(desde) : `${numero(desde)}–${numero(hasta)}`} de {numero(total)}{" "}
        {total === 1 ? nombre[0] : nombre[1]}
      </p>
      {paginas > 1 && (
        <div className="flex items-center gap-1">
          {pagina.numero > 1 ? (
            <Link href={href(pagina.numero - 1)} className={boton} aria-label="Página anterior">
              <ChevronLeft />
            </Link>
          ) : (
            <span className={cn(boton, "pointer-events-none opacity-40")} aria-hidden>
              <ChevronLeft />
            </span>
          )}
          {paginasVisibles(pagina.numero, paginas).map((n, i) =>
            n === null ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: los saltos no tienen identidad propia.
              <span key={`salto-${i}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={href(n)}
                aria-current={n === pagina.numero ? "page" : undefined}
                className={cn(
                  buttonVariants({
                    variant: n === pagina.numero ? "outline" : "ghost",
                    size: "sm",
                  }),
                  "min-w-7 px-2 tabular-nums",
                  n === pagina.numero && "pointer-events-none font-semibold",
                )}
              >
                {n}
              </Link>
            ),
          )}
          {pagina.numero < paginas ? (
            <Link href={href(pagina.numero + 1)} className={boton} aria-label="Página siguiente">
              <ChevronRight />
            </Link>
          ) : (
            <span className={cn(boton, "pointer-events-none opacity-40")} aria-hidden>
              <ChevronRight />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
