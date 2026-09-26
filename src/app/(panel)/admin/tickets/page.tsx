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
import { listarTickets } from "@/server/modules/catalogo/tickets";
import { cambiarEstadoTicketAccion } from "./acciones";
import { NuevoTicket } from "./nuevo-ticket";

export const metadata: Metadata = { title: "Tickets" };

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
        descripcion="Códigos de descuento para compras de paquetes nuevos (no aplican a renovaciones). El descuento de cada compra no supera el tope."
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
                  <TableHead className="text-right">Tope por compra</TableHead>
                  <TableHead className="text-right">Descontado</TableHead>
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
                      <TableCell className="text-right tabular-nums">{pesos(k.tope)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pesos(k.descontado)}
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
