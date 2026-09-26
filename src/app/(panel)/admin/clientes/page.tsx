import { ChevronRight, Download, Search, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
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
import { formatearCuit } from "@/domain/cuentas/cuit";
import { CONDICIONES_IVA_ETIQUETA } from "@/lib/argentina";
import { fechaCorta } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarClientes } from "@/server/modules/cuentas/consultas";

export const metadata: Metadata = { title: "Clientes" };

export default async function PaginaClientes({ searchParams }: PageProps<"/admin/clientes">) {
  await requerirSofteam();
  const { q, inactivos } = await searchParams;
  const busqueda = typeof q === "string" ? q : "";
  const conInactivos = inactivos === "1";
  const db = await obtenerDb();
  const clientes = await listarClientes(db, { busqueda, inactivos: conInactivos });

  return (
    <>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Brokers y productores con cuenta en STLic, con sus empresas y datos de facturación."
        acciones={
          <a
            href={`/admin/reportes/exportar?${new URLSearchParams({ reporte: "clientes", q: busqueda, inactivos: conInactivos ? "1" : "" })}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Download data-icon="inline-start" /> Exportar a Excel
          </a>
        }
      />

      <search className="mb-5">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              key={busqueda}
              defaultValue={busqueda}
              placeholder="Buscar por nombre, CUIT, mail o número de cliente"
              className="h-10 pl-9"
              aria-label="Buscar clientes"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="inactivos"
              value="1"
              defaultChecked={conInactivos}
              className="size-4 accent-primary"
            />
            Incluir inactivos
          </label>
          <Button type="submit" variant="secondary" className="h-10">
            Buscar
          </Button>
        </form>
      </search>

      {clientes.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>{busqueda ? "Sin resultados" : "Todavía no hay clientes"}</EmptyTitle>
            <EmptyDescription>
              {busqueda
                ? `No encontramos clientes para “${busqueda}”.`
                : "Los brokers se dan de alta solos desde la pantalla de registro."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Celular: tarjetas */}
          <ul className="grid gap-3 md:hidden">
            {clientes.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/clientes/${c.id}`}>
                  <Card className="gap-2 p-4 transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{c.nombre}</p>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      #{c.numero} · {formatearCuit(c.cuit)} · {c.empresas} empresa
                      {c.empresas === 1 ? "" : "s"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {c.corporativo && <Badge variant="secondary">Corporativo</Badge>}
                      {c.grupo && <Badge variant="outline">{c.grupo}</Badge>}
                      {!c.activo && <Badge variant="destructive">Inactivo</Badge>}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-20 pl-4">N.º</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CUIT</TableHead>
                  <TableHead className="hidden lg:table-cell">Condición IVA</TableHead>
                  <TableHead className="text-center">Empresas</TableHead>
                  <TableHead className="hidden xl:table-cell">Alta</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c) => (
                  <TableRow key={c.id} className="group relative">
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                      {c.numero}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/clientes/${c.id}`}
                        className="font-medium after:absolute after:inset-0"
                      >
                        {c.nombre}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {c.email}
                        {c.corporativo && <Badge variant="secondary">Corporativo</Badge>}
                        {c.grupo && <Badge variant="outline">{c.grupo}</Badge>}
                        {!c.activo && <Badge variant="destructive">Inactivo</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatearCuit(c.cuit)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {CONDICIONES_IVA_ETIQUETA[c.condicionIva]}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{c.empresas}</TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">
                      {fechaCorta(c.creadoEn)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <p className="mt-3 text-xs text-muted-foreground">
            {clientes.length} cliente{clientes.length === 1 ? "" : "s"}
            {clientes.length === 200 && " (se muestran los 200 más recientes; refiná la búsqueda)"}
          </p>
        </>
      )}
    </>
  );
}
