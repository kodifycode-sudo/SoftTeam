import { asc, eq } from "drizzle-orm";
import { Power, PowerOff, TicketPercent } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hoy } from "@/domain/fecha";
import { fechaCorta, pesos, porcentajeTexto } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import * as t from "@/server/db/schema";
import { listarTickets, type TicketListado } from "@/server/modules/catalogo/tickets";
import { cambiarEstadoTicketAccion } from "./acciones";
import { NuevoTicket } from "./nuevo-ticket";

export const metadata: Metadata = { title: "Tickets" };

function Uso({ k }: { k: TicketListado }) {
  const porcentajeUsado = k.tope > 0n ? Number((k.consumido * 100n) / k.tope) : 0;
  return (
    <div className="min-w-40 space-y-1">
      <p className="text-sm tabular-nums">
        {pesos(k.consumido)} <span className="text-muted-foreground">de {pesos(k.tope)}</span>
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: <meter> no se puede estilizar igual en todos los navegadores; el role conserva la semántica. */}
      <div
        role="meter"
        aria-label={`Tope usado de ${k.codigo}`}
        aria-valuenow={Math.min(porcentajeUsado, 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full bg-primary", porcentajeUsado >= 100 && "bg-brand")}
          style={{ width: `${Math.min(porcentajeUsado, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default async function PaginaTickets() {
  const { rol } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const db = await obtenerDb();
  const fechaHoy = hoy();
  const [tickets, paquetes] = await Promise.all([
    listarTickets(db),
    db
      .select({ id: t.paquetes.id, nombre: t.paquetes.nombre })
      .from(t.paquetes)
      .where(eq(t.paquetes.activo, true))
      .orderBy(asc(t.paquetes.nombre)),
  ]);
  const administra = rol === "ADMINISTRACION";

  return (
    <>
      <EncabezadoPagina
        titulo="Tickets"
        descripcion="Códigos de descuento con tope. El tope funciona como saldo: se consume en la compra y en sus renovaciones durante un año."
        acciones={administra && <NuevoTicket paquetes={paquetes} hoy={fechaHoy} />}
      />
      {tickets.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TicketPercent />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay tickets</EmptyTitle>
            <EmptyDescription>
              Creá un código para una promoción o un cliente puntual.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Ticket</TableHead>
                  <TableHead>Descuento</TableHead>
                  <TableHead>Uso del tope</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead className="text-center">Compras</TableHead>
                  {administra && <TableHead className="w-32" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((k) => {
                  const vencido = k.vigenteHasta < fechaHoy;
                  return (
                    <TableRow key={k.id} className={cn(!k.activo && "opacity-60")}>
                      <TableCell className="pl-4">
                        <p className="flex flex-wrap items-center gap-2 font-mono font-semibold">
                          {k.codigo}
                          {!k.activo && <Badge variant="outline">Inactivo</Badge>}
                          {k.activo && vencido && <Badge variant="outline">Vencido</Badge>}
                        </p>
                        <p className="max-w-64 truncate text-xs text-muted-foreground">
                          {k.descripcion ?? "Sin descripción"}
                          {k.paquetes.length > 0 && ` · Solo: ${k.paquetes.join(", ")}`}
                        </p>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {porcentajeTexto(k.porcentaje)}
                      </TableCell>
                      <TableCell>
                        <Uso k={k} />
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {fechaCorta(k.vigenteDesde)} – {fechaCorta(k.vigenteHasta)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{k.usos}</TableCell>
                      {administra && (
                        <TableCell>
                          <form action={cambiarEstadoTicketAccion}>
                            <input type="hidden" name="id" value={k.id} />
                            <input type="hidden" name="activo" value={String(!k.activo)} />
                            <Button type="submit" variant="ghost" size="sm">
                              {k.activo ? (
                                <PowerOff data-icon="inline-start" />
                              ) : (
                                <Power data-icon="inline-start" />
                              )}
                              {k.activo ? "Desactivar" : "Activar"}
                            </Button>
                          </form>
                        </TableCell>
                      )}
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
