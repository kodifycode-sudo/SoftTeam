import { Headset, MessageSquareWarning, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { SelectNativo } from "@/components/select-nativo";
import { ESTADOS_INCIDENTE, EstadoIncidente, PRIORIDADES } from "@/components/soporte/conversacion";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  bandejaDeSoporte,
  type EstadoIncidente as Estado,
  PRODUCTOS_SOPORTE,
} from "@/server/modules/soporte/incidentes";

export const metadata: Metadata = { title: "Soporte" };

const horaCorta = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

export default async function BandejaSoporte({ searchParams }: PageProps<"/admin/soporte">) {
  const { user } = await requerirSofteam();
  const sp = await searchParams;
  const estado =
    typeof sp.estado === "string" && (sp.estado === "ABIERTOS" || sp.estado in ESTADOS_INCIDENTE)
      ? (sp.estado as Estado | "ABIERTOS")
      : "ABIERTOS";
  const asignacion = typeof sp.asignado === "string" ? sp.asignado : "";
  const texto = typeof sp.q === "string" ? sp.q : "";
  const incidentes = await bandejaDeSoporte(await obtenerDb(), {
    estado,
    asignadoAId: asignacion === "mios" ? user.id : asignacion === "sin" ? "SIN_ASIGNAR" : undefined,
    texto,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Soporte"
        descripcion="Pedidos de asistencia de los clientes. Primero lo urgente y lo que más espera."
      />
      <search className="mb-5">
        <form className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              key={texto}
              defaultValue={texto}
              placeholder="Buscar por número, asunto o empresa"
              className="h-10 pl-9"
              aria-label="Buscar pedidos"
            />
          </div>
          <SelectNativo
            name="estado"
            key={estado}
            defaultValue={estado}
            aria-label="Estado"
            className="h-10 lg:w-48"
          >
            <option value="ABIERTOS">Abiertos (sin resolver)</option>
            {Object.entries(ESTADOS_INCIDENTE).map(([valor, e]) => (
              <option key={valor} value={valor}>
                {e.etiqueta}
              </option>
            ))}
          </SelectNativo>
          <SelectNativo
            name="asignado"
            key={asignacion}
            defaultValue={asignacion}
            aria-label="Asignación"
            className="h-10 lg:w-44"
          >
            <option value="">Todos</option>
            <option value="mios">Asignados a mí</option>
            <option value="sin">Sin asignar</option>
          </SelectNativo>
          <Button type="submit" variant="secondary" className="h-10">
            Filtrar
          </Button>
        </form>
      </search>

      {incidentes.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Headset />
            </EmptyMedia>
            <EmptyTitle>No hay pedidos</EmptyTitle>
            <EmptyDescription>Nada pendiente con esos filtros.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Pedido</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Asignado</TableHead>
                  <TableHead>Última actividad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidentes.map((i) => {
                  const p = PRIORIDADES[i.prioridad];
                  const abierto = i.estado !== "RESUELTO" && i.estado !== "CERRADO";
                  return (
                    <TableRow key={i.id} className="relative">
                      <TableCell className="max-w-sm pl-4 whitespace-normal">
                        <Link
                          href={`/admin/soporte/${i.id}`}
                          className="font-medium after:absolute after:inset-0"
                        >
                          #{i.numero} · {i.asunto}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {PRODUCTOS_SOPORTE[i.producto as keyof typeof PRODUCTOS_SOPORTE] ??
                            i.producto}
                        </p>
                      </TableCell>
                      <TableCell>
                        {i.empresa}{" "}
                        <span className="text-xs text-muted-foreground">#{i.empresaNumero}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.clase}>
                          {p.etiqueta}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1">
                          <EstadoIncidente estado={i.estado} />
                          {abierto && i.esperaSofteam && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-destructive/40 text-destructive"
                            >
                              <MessageSquareWarning className="size-3" /> Espera respuesta
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className={cn(!i.asignadoA && "text-muted-foreground")}>
                        {i.asignadoA ?? "Sin asignar"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {horaCorta(i.ultimaActividadEn)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}
