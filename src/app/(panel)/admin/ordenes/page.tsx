import { ChevronRight, Download, Receipt, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EstadoOrden } from "@/components/compra/vista-orden";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { ColumnaOrdenable, Paginacion } from "@/components/panel/listado";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { fechaCorta, pesos } from "@/lib/formato";
import { hrefListado, leerListado } from "@/lib/listados";
import { nombresEquivalentes } from "@/lib/nombres";
import { cn } from "@/lib/utils";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { totalDe } from "@/server/db/listados";
import { leerParametroDe } from "@/server/modules/parametros";
import {
  COLUMNAS_ORDENES,
  type EstadoOrden as Estado,
  listarOrdenes,
} from "@/server/modules/ventas/ordenes";

export const metadata: Metadata = { title: "Órdenes" };

const BASE = "/admin/ordenes";

const FILTROS: [Estado | "", string][] = [
  ["PEND_PAGO", "Pendientes"],
  ["PAGADA", "Pagadas"],
  ["CANCELADA", "Canceladas"],
  ["", "Todas"],
];

/** Semáforo de antigüedad de una orden impaga (parámetro cobranza.semaforo_dias). */
function Semaforo({ dias, umbrales }: { dias: number; umbrales: [number, number] }) {
  const [amarillo, rojo] = umbrales;
  const tono = dias >= rojo ? "bg-destructive" : dias >= amarillo ? "bg-warning" : "bg-success";
  const texto = dias >= rojo ? "Demorada" : dias >= amarillo ? "Atención" : "En plazo";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`${texto}: ${dias} días`}
    >
      <span className={cn("size-2 rounded-full", tono)} aria-hidden />
      {dias} día{dias === 1 ? "" : "s"}
    </span>
  );
}

export default async function OrdenesAdmin({ searchParams }: PageProps<"/admin/ordenes">) {
  await requerirSofteam();
  const sp = await searchParams;
  const estado = FILTROS.some(([v]) => v === sp.estado) ? (sp.estado as Estado | "") : "PEND_PAGO";
  const busqueda = typeof sp.q === "string" ? sp.q : "";
  const { pagina, orden } = leerListado(sp, COLUMNAS_ORDENES, {
    columna: "emitida",
    direccion: "desc",
  });
  const db = await obtenerDb();
  const [ordenes, umbrales] = await Promise.all([
    listarOrdenes(db, { estado: estado || undefined, busqueda, pagina, orden }),
    leerParametroDe(db, "cobranza.semaforo_dias"),
  ]);
  if (ordenes.length === 0 && pagina.numero > 1) {
    redirect(hrefListado(BASE, sp, { pagina: 1 }));
  }
  const columna = { orden, base: BASE, parametros: sp };
  const ahora = Date.now();
  const dias = (d: Date) => Math.floor((ahora - d.getTime()) / 86_400_000);

  return (
    <>
      <EncabezadoPagina
        titulo="Órdenes"
        descripcion={`Cobranza de compras y renovaciones. El semáforo marca las pendientes con más de ${umbrales[0]} y ${umbrales[1]} días.`}
        acciones={
          <a
            href={`/admin/reportes/exportar?${new URLSearchParams({ reporte: "ordenes", estado, q: busqueda })}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Download data-icon="inline-start" /> Exportar a Excel
          </a>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-full border bg-card p-0.5">
          {FILTROS.map(([valor, texto]) => (
            <Link
              key={texto}
              href={`/admin/ordenes${valor ? `?estado=${valor}` : "?estado="}`}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                estado === valor
                  ? "bg-navy text-navy-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {texto}
            </Link>
          ))}
        </div>
        <search>
          <form className="flex gap-2">
            <input type="hidden" name="estado" value={estado} />
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                key={busqueda}
                defaultValue={busqueda}
                placeholder="N.º de orden"
                inputMode="numeric"
                className="h-9 w-40 pl-9"
              />
            </div>
            <Button type="submit" variant="secondary" className="h-9">
              Buscar
            </Button>
          </form>
        </search>
      </div>

      {ordenes.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>No hay órdenes para mostrar</EmptyTitle>
            <EmptyDescription>Probá con otro filtro.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {ordenes.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/ordenes/${o.id}`}>
                  <Card className="gap-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">#{o.numero}</p>
                      <span className="flex flex-wrap justify-end gap-1">
                        <EstadoOrden estado={o.estado} />
                        {o.requiereRevision && <Badge variant="destructive">Revisar</Badge>}
                        {o.estado === "PEND_PAGO" && o.pagoError && (
                          <Badge
                            variant="outline"
                            className="border-destructive/40 text-destructive"
                          >
                            Pago rechazado
                          </Badge>
                        )}
                      </span>
                    </div>
                    <p className="text-sm">{o.empresa ?? o.cliente}</p>
                    <div className="flex items-center justify-between text-sm">
                      {o.estado === "PEND_PAGO" ? (
                        <Semaforo dias={dias(o.emitidaEn)} umbrales={umbrales} />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {fechaCorta(o.emitidaEn)}
                        </span>
                      )}
                      <span className="font-semibold tabular-nums">{pesos(o.total)}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <ColumnaOrdenable columna="numero" {...columna} className="pl-4">
                    Orden
                  </ColumnaOrdenable>
                  <ColumnaOrdenable columna="empresa" {...columna}>
                    Empresa
                  </ColumnaOrdenable>
                  <TableHead className="hidden lg:table-cell">Medio de pago</TableHead>
                  <ColumnaOrdenable columna="emitida" {...columna}>
                    Emitida
                  </ColumnaOrdenable>
                  <TableHead>Estado</TableHead>
                  <ColumnaOrdenable
                    columna="total"
                    {...columna}
                    alinear="derecha"
                    className="text-right"
                  >
                    Total
                  </ColumnaOrdenable>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenes.map((o) => (
                  <TableRow key={o.id} className="group relative">
                    <TableCell className="pl-4">
                      <Link
                        href={`/admin/ordenes/${o.id}`}
                        className="font-semibold after:absolute after:inset-0"
                      >
                        #{o.numero}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="block">{o.empresa ?? "Orden agrupada"}</span>
                      {/* El cliente solo si dice algo más que el nombre de la empresa. */}
                      {!(o.empresa && nombresEquivalentes(o.empresa, o.cliente)) && (
                        <span className="text-xs text-muted-foreground">{o.cliente}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{o.medio}</TableCell>
                    <TableCell>
                      {o.estado === "PEND_PAGO" ? (
                        <Semaforo dias={dias(o.emitidaEn)} umbrales={umbrales} />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {fechaCorta(o.emitidaEn)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        <EstadoOrden estado={o.estado} />
                        {o.requiereRevision && <Badge variant="destructive">Revisar</Badge>}
                        {o.estado === "PEND_PAGO" && o.pagoError && (
                          <Badge
                            variant="outline"
                            className="border-destructive/40 text-destructive"
                          >
                            Pago rechazado
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {pesos(o.total)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Paginacion
            pagina={pagina}
            total={totalDe(ordenes)}
            base={BASE}
            parametros={sp}
            nombre={["orden", "órdenes"]}
          />
        </>
      )}
    </>
  );
}
