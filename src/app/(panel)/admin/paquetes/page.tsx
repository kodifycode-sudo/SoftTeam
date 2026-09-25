import { CircleCheck, Eye, EyeOff, PackageOpen, Pencil, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TarjetaPaquete } from "@/components/catalogo/tarjeta-paquete";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { hoy } from "@/domain/fecha";
import { PRODUCTOS_UI } from "@/lib/productos";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarPaquetes } from "@/server/modules/catalogo/paquetes";
import { cambiarActivoAccion } from "./acciones";

export const metadata: Metadata = { title: "Paquetes" };

type Filtros = {
  q: string;
  tipo: "" | "TEMPORAL" | "CONSUMIBLE";
  productos: string[];
  inactivos: boolean;
};

/** URL con un filtro cambiado (los filtros viven en la URL: se comparten y sobreviven al recargar). */
function url(filtros: Filtros, cambio: Partial<Filtros>): string {
  const f = { ...filtros, ...cambio };
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.tipo) params.set("tipo", f.tipo);
  for (const p of f.productos) params.append("p", p);
  if (f.inactivos) params.set("inactivos", "1");
  const texto = params.toString();
  return `/admin/paquetes${texto ? `?${texto}` : ""}`;
}

const chip = (activo: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
    activo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
  );

export default async function PaginaPaquetes({ searchParams }: PageProps<"/admin/paquetes">) {
  const { rol } = await requerirSofteam();
  const sp = await searchParams;
  const filtros: Filtros = {
    q: typeof sp.q === "string" ? sp.q : "",
    tipo: sp.tipo === "TEMPORAL" || sp.tipo === "CONSUMIBLE" ? sp.tipo : "",
    productos: ([] as string[]).concat(sp.p ?? []).filter((p) => p in PRODUCTOS_UI),
    inactivos: sp.inactivos === "1",
  };
  const db = await obtenerDb();
  const paquetes = await listarPaquetes(db, {
    hoy: hoy(),
    busqueda: filtros.q,
    tipo: filtros.tipo || undefined,
    productos: filtros.productos,
    inactivos: filtros.inactivos,
  });
  const puedeEditar = rol === "ADMINISTRACION";
  const puedeActivar = rol === "ADMINISTRACION" || rol === "COMERCIAL";

  return (
    <>
      <EncabezadoPagina
        titulo="Paquetes"
        descripcion="Catálogo de paquetes a la venta: límites por producto y alternativas de precio."
        acciones={
          puedeEditar && (
            <Link href="/admin/paquetes/nuevo" className={buttonVariants({ size: "lg" })}>
              <Plus data-icon="inline-start" /> Nuevo paquete
            </Link>
          )
        }
      />

      {sp.guardado === "1" && (
        <Alert className="mb-5 border-success/30 bg-success/5">
          <CircleCheck className="text-success" />
          <AlertDescription className="text-success">Paquete guardado.</AlertDescription>
        </Alert>
      )}

      <div className="mb-6 space-y-3">
        <search>
          <form className="flex gap-2">
            {filtros.tipo && <input type="hidden" name="tipo" value={filtros.tipo} />}
            {filtros.productos.map((p) => (
              <input key={p} type="hidden" name="p" value={p} />
            ))}
            {filtros.inactivos && <input type="hidden" name="inactivos" value="1" />}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                key={filtros.q}
                defaultValue={filtros.q}
                placeholder="Buscar por nombre o código"
                className="h-10 pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" className="h-10">
              Buscar
            </Button>
          </form>
        </search>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border bg-card p-0.5">
            {[
              ["", "Todos"],
              ["TEMPORAL", "Temporales"],
              ["CONSUMIBLE", "Consumibles"],
            ].map(([valor, texto]) => (
              <Link
                key={valor}
                href={url(filtros, { tipo: valor as Filtros["tipo"] })}
                className={cn(
                  "rounded-full px-3 py-1 text-sm transition-colors",
                  filtros.tipo === valor
                    ? "bg-navy text-navy-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {texto}
              </Link>
            ))}
          </div>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          {Object.entries(PRODUCTOS_UI).map(([id, p]) => {
            const activo = filtros.productos.includes(id);
            return (
              <Link
                key={id}
                href={url(filtros, {
                  productos: activo
                    ? filtros.productos.filter((x) => x !== id)
                    : [...filtros.productos, id],
                })}
                className={chip(activo)}
              >
                <p.icono className="size-3.5" /> {p.nombre}
              </Link>
            );
          })}
          <Link
            href={url(filtros, { inactivos: !filtros.inactivos })}
            className={cn(chip(filtros.inactivos), "sm:ml-auto")}
          >
            {filtros.inactivos ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {filtros.inactivos ? "Mostrando inactivos" : "Mostrar inactivos"}
          </Link>
        </div>
      </div>

      {paquetes.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>No hay paquetes para mostrar</EmptyTitle>
            <EmptyDescription>Probá con otros filtros o creá un paquete nuevo.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {paquetes.map((p) => (
            <TarjetaPaquete
              key={p.id}
              paquete={p}
              mostrarEstado
              acciones={
                <>
                  <span className="mr-auto text-xs text-muted-foreground">
                    {p.contratosVigentes} contrato{p.contratosVigentes === 1 ? "" : "s"} vigente
                    {p.contratosVigentes === 1 ? "" : "s"}
                  </span>
                  {puedeActivar && (
                    <form action={cambiarActivoAccion}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="activo" value={String(!p.activo)} />
                      <Button type="submit" variant="ghost" size="sm">
                        {p.activo ? (
                          <EyeOff data-icon="inline-start" />
                        ) : (
                          <Eye data-icon="inline-start" />
                        )}
                        {p.activo ? "Inactivar" : "Activar"}
                      </Button>
                    </form>
                  )}
                  {puedeEditar && (
                    <Link
                      href={`/admin/paquetes/${p.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Pencil data-icon="inline-start" /> Editar
                    </Link>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
