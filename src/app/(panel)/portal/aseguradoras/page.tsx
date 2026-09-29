import { Cable, Search, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { excedeLicencia, TIPOS_INTERFAZ, type TipoInterfaz } from "@/domain/cuentas/limites";
import { fechaCorta } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirConfiguracionEmpresa } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  type EstadoInterfaz,
  listarAseguradorasEmpresa,
} from "@/server/modules/configuracion/aseguradoras";
import { usoDeLimites } from "@/server/modules/configuracion/limites";
import { AgregarAseguradoras } from "./agregar";
import { InterruptorAseguradora } from "./interruptor";

export const metadata: Metadata = { title: "Aseguradoras" };

const NOMBRE: Record<TipoInterfaz, string> = { prodigal: "Prodigal", cotiweb: "CotiWeb" };

function ayudaInterfaz(i: EstadoInterfaz, trabaja: boolean, licenciado: boolean) {
  if (!i.disponible) return "Todavía no disponible";
  if (i.bajaDesde) return `Se da de baja el ${fechaCorta(i.bajaDesde)}`;
  if (!trabaja) return undefined;
  if (!licenciado && !i.vigente) return "No incluida en tu licencia";
  return undefined;
}

export default async function PaginaAseguradoras({
  searchParams,
}: PageProps<"/portal/aseguradoras">) {
  const contexto = await requerirConfiguracionEmpresa();
  const { q } = await searchParams;
  const busqueda = typeof q === "string" ? q.trim().toLowerCase() : "";
  const db = await obtenerDb();
  const [todas, uso] = await Promise.all([
    listarAseguradorasEmpresa(db, contexto.empresaId),
    usoDeLimites(db, contexto.empresaId),
  ]);
  // Las de la empresa: con las que trabaja, y las que dejó pero todavía tienen
  // una interfaz vigente hasta fin de mes.
  const deLaEmpresa = todas.filter(
    (a) => a.trabaja || TIPOS_INTERFAZ.some((tipo) => a.interfaces[tipo].vigente),
  );
  const aseguradoras = deLaEmpresa.filter(
    (a) =>
      !busqueda ||
      a.nombre.toLowerCase().includes(busqueda) ||
      a.abreviatura.toLowerCase().includes(busqueda),
  );
  const disponibles = todas
    .filter((a) => !a.trabaja && !a.discontinuada)
    .map((a) => ({
      id: a.id,
      nombre: a.nombre,
      abreviatura: a.abreviatura,
      prodigal: a.interfaces.prodigal.disponible,
      cotiweb: a.interfaces.cotiweb.disponible,
    }));
  const agregar = (
    <AgregarAseguradoras
      disponibles={disponibles}
      licencias={{
        prodigal: uso.interfaces.prodigal.licenciado,
        cotiweb: uso.interfaces.cotiweb.licenciado,
      }}
    />
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Aseguradoras"
        descripcion="Con qué compañías trabajás y qué interfaces tenés activas. Dar de baja una interfaz rige desde el mes siguiente."
        acciones={agregar}
      />

      <section aria-label="Interfaces licenciadas" className="mb-6 grid gap-3 sm:grid-cols-2">
        {TIPOS_INTERFAZ.map((tipo) => {
          const u = uso.interfaces[tipo];
          const excedido = excedeLicencia(u);
          return (
            <Card key={tipo} className="flex-row items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Cable className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Interfaces de {NOMBRE[tipo]}</p>
                <p className="text-xs text-muted-foreground">
                  {u.licenciado ? "Activas sobre las licenciadas" : "No incluidas en tu licencia"}
                </p>
              </div>
              <p className="text-lg tabular-nums">
                <span className={cn("font-semibold", excedido && "text-destructive")}>
                  {u.enUso}
                </span>
                <span className="text-muted-foreground"> / {u.licenciados}</span>
              </p>
            </Card>
          );
        })}
      </section>

      <search className="mb-5">
        <form className="flex gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              key={busqueda}
              defaultValue={busqueda}
              placeholder="Buscar entre tus aseguradoras"
              className="h-10 pl-9"
              aria-label="Buscar aseguradora"
            />
          </div>
          <Button type="submit" variant="secondary" className="h-10">
            Buscar
          </Button>
        </form>
      </search>

      {aseguradoras.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>
              {deLaEmpresa.length === 0 ? "Todavía no elegiste aseguradoras" : "Sin resultados"}
            </EmptyTitle>
            <EmptyDescription>
              {deLaEmpresa.length === 0
                ? "Agregá del catálogo las compañías con las que trabaja la empresa: podés elegir varias de una vez."
                : "No encontramos, entre las tuyas, aseguradoras con ese nombre."}
            </EmptyDescription>
          </EmptyHeader>
          {deLaEmpresa.length === 0 && agregar}
        </Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {aseguradoras.map((a) => (
            <li key={a.id}>
              <Card className={cn("h-full gap-4 p-5", a.trabaja && "border-primary/40 shadow-sm")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{a.nombre}</p>
                    <p className="font-mono text-xs text-muted-foreground">{a.abreviatura}</p>
                  </div>
                  <span className="flex flex-wrap justify-end gap-1">
                    {a.discontinuada && <Badge variant="outline">Discontinuada</Badge>}
                    {a.trabaja && <Badge variant="secondary">Trabajás con ella</Badge>}
                  </span>
                </div>
                <InterruptorAseguradora
                  aseguradoraId={a.id}
                  cambio="trabaja"
                  valor={a.trabaja}
                  etiqueta="Trabajo con esta aseguradora"
                  ayuda={
                    a.discontinuada
                      ? "SOFTeam la discontinuó: podés darla de baja, pero no activar nada nuevo."
                      : undefined
                  }
                  deshabilitado={a.discontinuada && !a.trabaja}
                />
                <div className="grid gap-3 border-t pt-4">
                  {TIPOS_INTERFAZ.map((tipo) => {
                    const i = a.interfaces[tipo];
                    const activa = i.vigente && !i.bajaDesde;
                    return (
                      <InterruptorAseguradora
                        key={tipo}
                        aseguradoraId={a.id}
                        cambio={tipo}
                        valor={activa}
                        etiqueta={`Interfaz con ${NOMBRE[tipo]}`}
                        ayuda={ayudaInterfaz(i, a.trabaja, uso.interfaces[tipo].licenciado)}
                        deshabilitado={!a.trabaja || (!i.disponible && !i.vigente)}
                      />
                    );
                  })}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
