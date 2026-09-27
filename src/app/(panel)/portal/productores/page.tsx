import { Briefcase, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
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
import { formatearCuit } from "@/domain/cuentas/cuit";
import { cn } from "@/lib/utils";
import { requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { usoDeLimites } from "@/server/modules/configuracion/limites";
import { listarProductores } from "@/server/modules/configuracion/productores";
import { listarOficinas } from "@/server/modules/cuentas/oficinas";
import { NuevoProductor } from "./formulario";

export const metadata: Metadata = { title: "Productores" };

type Productor = Awaited<ReturnType<typeof listarProductores>>[number];

function Roles({ p }: { p: Productor }) {
  return (
    <div className="flex flex-wrap gap-1">
      {p.esProductor && <Badge variant="secondary">Productor</Badge>}
      {p.esOrganizador && <Badge variant="secondary">Organizador</Badge>}
      {p.esSubproductor && <Badge variant="secondary">Subproductor</Badge>}
      {p.agenteInstitorio && <Badge variant="outline">Institorio</Badge>}
      {!p.activo && <Badge variant="outline">De baja</Badge>}
    </div>
  );
}

export default async function PaginaProductores() {
  const contexto = await requerirConfiguracion();
  const db = await obtenerDb();
  const [productores, oficinas, uso] = await Promise.all([
    listarProductores(db, contexto.empresaId, contexto.alcance),
    listarOficinas(db, contexto.empresaId, contexto.alcance),
    usoDeLimites(db, contexto.empresaId),
  ]);
  const opcionesOficina = oficinas.map((o) => ({
    id: o.id,
    etiqueta: `${o.canalCodigo}-${o.codigo} · ${o.nombre}`,
  }));

  return (
    <>
      <EncabezadoPagina
        titulo="Productores"
        descripcion={
          contexto.alcanceNombre
            ? `Productores de ${contexto.alcanceNombre}, con sus códigos en cada aseguradora.`
            : "Productores, organizadores y subproductores, con sus códigos en cada aseguradora."
        }
        acciones={
          <NuevoProductor
            oficinas={opcionesOficina}
            tieneInstitorio={uso.funciones.has("prodigal.institorio")}
            sinOficina={contexto.alcance.tipo === "empresa"}
          />
        }
      />

      {productores.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Briefcase />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay productores</EmptyTitle>
            <EmptyDescription>
              Cargalos para que Prodigal y CotiWeb asignen la cartera y los códigos.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {productores.map((p) => (
              <li key={p.id}>
                <Link href={`/portal/productores/${p.id}`}>
                  <Card
                    className={cn(
                      "gap-2 p-4 transition-shadow hover:shadow-md",
                      !p.activo && "opacity-60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{p.nombre}</p>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[
                        p.matricula && `Mat. ${p.matricula}`,
                        p.cuit && formatearCuit(p.cuit),
                        `${p.codigos} códigos`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <Roles p={p} />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <Card className="hidden overflow-hidden p-0 md:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-4">Productor</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead className="hidden lg:table-cell">Oficina</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-center">Códigos</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {productores.map((p) => (
                  <TableRow key={p.id} className={cn("group relative", !p.activo && "opacity-60")}>
                    <TableCell className="pl-4">
                      <Link
                        href={`/portal/productores/${p.id}`}
                        className="font-medium after:absolute after:inset-0"
                      >
                        {p.nombre}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.cuit ? formatearCuit(p.cuit) : "Sin CUIT"}
                        {p.email && ` · ${p.email}`}
                      </p>
                    </TableCell>
                    <TableCell className="tabular-nums">{p.matricula ?? "—"}</TableCell>
                    <TableCell className="hidden font-mono text-xs lg:table-cell">
                      {p.oficinaCodigo ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Roles p={p} />
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{p.codigos}</TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
