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
import { listarPaises } from "@/server/modules/catalogo/paises";
import { paquetesActivos } from "@/server/modules/catalogo/paquetes";
import { listarTickets } from "@/server/modules/catalogo/tickets";
import { cambiarEstadoTicketAccion } from "./acciones";
import { NuevoTicket } from "./nuevo-ticket";

export const metadata: Metadata = { title: "Tickets" };

const USOS = {
  UNICO_X_CLIENTE: "Una vez por cliente",
  UNICO_ABSOLUTO: "Una sola vez",
  MULTIPLE: "Varias veces",
} as const;

export default async function PaginaTickets() {
  const { rol } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const db = await obtenerDb();
  const fechaHoy = hoy();
  const [tickets, paquetes, paises] = await Promise.all([
    listarTickets(db),
    paquetesActivos(db),
    listarPaises(db),
  ]);
  const administra = rol === "ADMINISTRACION";

  return (
    <>
      <EncabezadoPagina
        titulo="Tickets"
        descripcion="Códigos de descuento. El tope funciona como saldo: la orden y sus renovaciones de los 12 meses siguientes descuentan hasta agotarlo."
        acciones={
          administra && (
            <NuevoTicket
              paquetes={paquetes}
              paises={paises.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre }))}
              hoy={fechaHoy}
            />
          )
        }
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
                  <TableHead className="text-right">Tope</TableHead>
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
                          {!k.publico && <Badge variant="secondary">Solo SOFTeam</Badge>}
                        </p>
                        <p className="max-w-64 truncate text-xs text-muted-foreground">
                          {k.descripcion ?? "Sin descripción"}
                          {k.paquetes.length > 0 && ` · Solo: ${k.paquetes.join(", ")}`}
                        </p>
                        <p className="max-w-64 truncate text-xs text-muted-foreground">
                          {USOS[k.uso as keyof typeof USOS] ?? k.uso}
                          {k.uso === "MULTIPLE" && k.usosMaximos > 0 && ` (hasta ${k.usosMaximos})`}
                          {k.cliente && ` · Para ${k.cliente}`}
                        </p>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {porcentajeTexto(k.porcentaje)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {k.tope > 0n ? pesos(k.tope) : "Sin tope"}
                      </TableCell>
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
