import { ChevronRight, Network } from "lucide-react";
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
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarGrupos } from "@/server/modules/cuentas/grupos";
import { NuevoGrupo } from "./dialogo";

export const metadata: Metadata = { title: "Grupos económicos" };

export default async function PaginaGrupos() {
  const { rol } = await requerirSofteam();
  const grupos = await listarGrupos(await obtenerDb());
  const edita = rol === "ADMINISTRACION" || rol === "COMERCIAL";

  return (
    <>
      <EncabezadoPagina
        titulo="Grupos económicos"
        descripcion="Clientes relacionados: para reportes y para la facturación consolidada por planilla."
        acciones={edita && <NuevoGrupo />}
      />
      {grupos.length === 0 ? (
        <Empty className="border border-dashed bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Network />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay grupos</EmptyTitle>
            <EmptyDescription>
              Por ejemplo, una aseguradora con los productores cuyas licencias paga.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {grupos.map((g) => (
            <li key={g.id}>
              <Link href={`/admin/grupos/${g.id}`} className="group block">
                <Card className="flex-row items-center gap-4 p-4 transition-shadow group-hover:shadow-md">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Network className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {g.nombre}
                      <Badge variant="outline" className="font-mono">
                        {g.nombreCorto}
                      </Badge>
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {g.miembros} cliente{g.miembros === 1 ? "" : "s"}
                      {g.principal && ` · Principal: ${g.principal}`}
                      {g.facturacion && ` · Factura a ${g.facturacion}`}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
