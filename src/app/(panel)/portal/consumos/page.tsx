import { Activity, Download } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { buttonVariants } from "@/components/ui/button";
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
import { numero } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { consumosDeEmpresa } from "@/server/modules/reportes/reportes";

export const metadata: Metadata = { title: "Consumos" };

const FAMILIAS: Record<string, string> = {
  notificaciones: "Notificaciones",
  cotizaciones: "Cotizaciones",
  soporte: "Soporte",
};

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);

export default async function PaginaConsumos() {
  const contexto = await requerirCliente();
  const consumos = await consumosDeEmpresa(await obtenerDb(), contexto.empresaId, 200);

  return (
    <>
      <EncabezadoPagina
        titulo="Consumos"
        descripcion="Lo que descontaron los productos (notificaciones y cotizaciones) y los pedidos de soporte. Se ven los últimos 200; la exportación trae todo."
        acciones={
          <a href="/portal/consumos/exportar" className={buttonVariants({ variant: "outline" })}>
            <Download data-icon="inline-start" /> Exportar a Excel
          </a>
        }
      />
      {consumos.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Activity />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay consumos</EmptyTitle>
            <EmptyDescription>
              Aparecen cuando tus productos envían notificaciones o cotizan, o cuando abrís un
              pedido de soporte.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 whitespace-nowrap">
                      {fechaHora(c.registradoEn)}
                    </TableCell>
                    <TableCell>{FAMILIAS[c.familia] ?? c.familia}</TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {[
                        c.concepto,
                        c.medio && `por ${c.medio}`,
                        c.oficina && `oficina ${c.oficina}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || c.sistema}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        c.consumidos < c.solicitados && "text-destructive",
                      )}
                    >
                      {numero(c.consumidos)}
                      {c.consumidos < c.solicitados && (
                        <span className="block text-xs">de {numero(c.solicitados)} pedidos</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}
