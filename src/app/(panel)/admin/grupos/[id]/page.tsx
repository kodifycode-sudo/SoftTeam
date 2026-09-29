import { ArrowLeft, Receipt, Star, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerGrupo } from "@/server/modules/cuentas/grupos";
import { quitarDelGrupoAccion } from "../acciones";
import { EditarGrupo } from "../dialogo";
import { AgregarMiembro, EliminarGrupo } from "./miembros";

export const metadata: Metadata = { title: "Grupo económico" };

export default async function PaginaGrupo({ params }: PageProps<"/admin/grupos/[id]">) {
  const { rol } = await requerirSofteam();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const grupo = await obtenerGrupo(await obtenerDb(), id);
  if (!grupo) notFound();
  const edita = rol === "ADMINISTRACION" || rol === "COMERCIAL";

  return (
    <>
      <Link
        href="/admin/grupos"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-3" })}
      >
        <ArrowLeft data-icon="inline-start" /> Grupos económicos
      </Link>
      <EncabezadoPagina
        etiqueta={grupo.nombreCorto}
        titulo={grupo.nombre}
        acciones={
          edita && (
            <>
              {grupo.miembros.length === 0 && <EliminarGrupo grupoId={grupo.id} />}
              <EditarGrupo
                grupo={{
                  id: grupo.id,
                  nombre: grupo.nombre,
                  nombreCorto: grupo.nombreCorto,
                  principal: grupo.principal ? String(grupo.principal.numero) : "",
                  facturacion: grupo.facturacion ? String(grupo.facturacion.numero) : "",
                }}
              />
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="size-4 text-primary" /> Cliente principal
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {grupo.principal ? (
              <Link
                href={`/admin/clientes/${grupo.principal.id}`}
                className="text-primary hover:underline"
              >
                {grupo.principal.nombre} · {formatearCuit(grupo.principal.cuit)}
              </Link>
            ) : (
              <span className="text-muted-foreground">Sin cliente principal</span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-primary" /> Facturación consolidada
            </CardTitle>
            <CardDescription>Para las órdenes pagadas con un medio de planilla.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {grupo.facturacion ? (
              <Link
                href={`/admin/clientes/${grupo.facturacion.id}`}
                className="text-primary hover:underline"
              >
                {grupo.facturacion.nombreFactura} · {formatearCuit(grupo.facturacion.cuit)}
              </Link>
            ) : (
              <span className="text-muted-foreground">
                Sin facturación consolidada: cada cliente recibe su factura.
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="size-4 text-primary" /> Clientes del grupo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {edita && <AgregarMiembro grupoId={grupo.id} />}
          {grupo.miembros.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay clientes en el grupo.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {grupo.miembros.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <Link href={`/admin/clientes/${m.id}`} className="font-medium hover:underline">
                      {m.nombre}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      #{m.numero} · {formatearCuit(m.cuit)} · {m.empresas} empresa
                      {m.empresas === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {grupo.principal?.id === m.id && <Badge>Principal</Badge>}
                    {!m.activo && <Badge variant="destructive">Inactivo</Badge>}
                    {edita && (
                      <form action={quitarDelGrupoAccion}>
                        <input type="hidden" name="grupoId" value={grupo.id} />
                        <input type="hidden" name="clienteId" value={m.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          aria-label={`Sacar a ${m.nombre} del grupo`}
                        >
                          Sacar
                        </Button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
