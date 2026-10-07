import { Activity, Download } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Paginacion } from "@/components/panel/listado";
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
import { hrefListado, leerPagina } from "@/lib/listados";
import { productoUI } from "@/lib/productos";
import { cn } from "@/lib/utils";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { totalDe } from "@/server/db/listados";
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

/** De dónde vino el consumo: el producto que lo informó, o el portal (soporte). */
const origen = (sistema: string) => (sistema === "stlic" ? "Portal" : productoUI(sistema).nombre);

export default async function PaginaConsumos({ searchParams }: PageProps<"/portal/consumos">) {
  const contexto = await requerirCliente();
  const parametros = await searchParams;
  const pagina = leerPagina(parametros, 50);
  const consumos = await consumosDeEmpresa(
    await obtenerDb(),
    contexto.empresaId,
    contexto.alcance,
    pagina,
  );
  if (consumos.length === 0 && pagina.numero > 1) {
    redirect(hrefListado("/portal/consumos", parametros, { pagina: 1 }));
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Consumos"
        descripcion="Lo que descontaron los productos (notificaciones y cotizaciones) y los pedidos de soporte, lo último primero."
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
                  <TableHead>Origen</TableHead>
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
                    <TableCell className="whitespace-nowrap">{origen(c.sistema)}</TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {[
                        c.concepto,
                        (c.medioNombre ?? c.medio) && `por ${c.medioNombre ?? c.medio}`,
                        c.oficina && `Oficina ${c.oficina}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
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
      {consumos.length > 0 && (
        <Paginacion
          pagina={pagina}
          total={totalDe(consumos)}
          base="/portal/consumos"
          parametros={parametros}
          nombre={["consumo", "consumos"]}
        />
      )}
    </>
  );
}
