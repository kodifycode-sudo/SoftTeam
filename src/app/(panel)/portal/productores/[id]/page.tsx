import { CircleCheck, Hash, Power, PowerOff, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearCuit } from "@/domain/cuentas/cuit";
import { requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { opcionesCondicionesIva } from "@/server/modules/catalogo/condiciones-iva";
import { listarAseguradorasEmpresa } from "@/server/modules/configuracion/aseguradoras";
import { usoDeLimites } from "@/server/modules/configuracion/limites";
import { obtenerProductor } from "@/server/modules/configuracion/productores";
import { listarOficinas } from "@/server/modules/cuentas/oficinas";
import { cambiarEstadoProductorAccion, quitarCodigoAccion } from "../acciones";
import { EditarProductor } from "../formulario";
import { AgregarCodigo } from "./codigos";

export const metadata: Metadata = { title: "Productor" };

const ROL = { PRODUCTOR: "Productor", ORGANIZADOR: "Organizador" } as const;

function Dato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm">{valor || "—"}</dd>
    </div>
  );
}

export default async function PaginaProductor({
  params,
  searchParams,
}: PageProps<"/portal/productores/[id]">) {
  const contexto = await requerirConfiguracion();
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await obtenerDb();
  const [productor, oficinas, aseguradoras, uso, condicionesIva] = await Promise.all([
    obtenerProductor(db, contexto.empresaId, id, contexto.alcance),
    listarOficinas(db, contexto.empresaId, contexto.alcance),
    listarAseguradorasEmpresa(db, contexto.empresaId),
    usoDeLimites(db, contexto.empresaId),
    opcionesCondicionesIva(db, "AR"),
  ]);
  if (!productor) notFound();
  if (productor.condicionIva && !condicionesIva.some((c) => c.codigo === productor.condicionIva)) {
    condicionesIva.push({
      codigo: productor.condicionIva,
      nombre: `${productor.condicionIvaNombre} (dada de baja)`,
    });
  }

  const oficina = oficinas.find((o) => o.id === productor.oficinaId);
  const roles = [
    ...(productor.esProductor || productor.esSubproductor
      ? [{ valor: "PRODUCTOR" as const, etiqueta: "Productor" }]
      : []),
    ...(productor.esOrganizador
      ? [{ valor: "ORGANIZADOR" as const, etiqueta: "Organizador" }]
      : []),
  ];
  const conLasQueTrabaja = aseguradoras.filter((a) => a.trabaja);

  return (
    <>
      <EncabezadoPagina
        migas={[{ texto: "Productores", href: "/portal/productores" }, { texto: productor.nombre }]}
        titulo={productor.nombre}
        etiqueta={
          <span className="flex flex-wrap gap-1.5">
            {productor.esProductor && <Badge variant="secondary">Productor</Badge>}
            {productor.esOrganizador && <Badge variant="secondary">Organizador</Badge>}
            {productor.esSubproductor && <Badge variant="secondary">Subproductor</Badge>}
            {productor.agenteInstitorio && <Badge variant="outline">Agente institorio</Badge>}
            {!productor.activo && <Badge variant="destructive">De baja</Badge>}
          </span>
        }
        acciones={
          <>
            <EditarProductor
              productor={productor}
              oficinas={oficinas.map((o) => ({
                id: o.id,
                etiqueta: `${o.canalCodigo}-${o.codigo} · ${o.nombre}`,
              }))}
              tieneInstitorio={uso.funciones.has("prodigal.institorio")}
              condicionesIva={condicionesIva}
              sinOficina={contexto.alcance.tipo === "empresa"}
            />
            <form action={cambiarEstadoProductorAccion}>
              <input type="hidden" name="id" value={productor.id} />
              <input type="hidden" name="activo" value={String(!productor.activo)} />
              <Button type="submit" variant="ghost">
                {productor.activo ? (
                  <PowerOff data-icon="inline-start" />
                ) : (
                  <Power data-icon="inline-start" />
                )}
                {productor.activo ? "Dar de baja" : "Reactivar"}
              </Button>
            </form>
          </>
        }
      />

      {aviso === "creado" && (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <CircleCheck />
          <AlertDescription className="text-success">
            Productor creado. Ahora cargá sus códigos en cada aseguradora.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4">
              <Dato etiqueta="Matrícula" valor={productor.matricula} />
              <Dato etiqueta="CUIT" valor={productor.cuit && formatearCuit(productor.cuit)} />
              <Dato etiqueta="Condición de IVA" valor={productor.condicionIvaNombre} />
              <Dato etiqueta="Mail" valor={productor.email} />
              <Dato
                etiqueta="Teléfonos"
                valor={[productor.telefono, productor.celular].filter(Boolean).join(" · ")}
              />
              <Dato etiqueta="Domicilio" valor={productor.domicilio} />
              <Dato
                etiqueta="Oficina"
                valor={oficina && `${oficina.canalCodigo}-${oficina.codigo} · ${oficina.nombre}`}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Códigos en aseguradoras</CardTitle>
            <CardDescription>
              El código con el que cada compañía identifica al productor. Solo aparecen las
              aseguradoras con las que trabajás.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {productor.codigos.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <Hash className="size-4" /> Todavía no tiene códigos.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-3">Aseguradora</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productor.codigos.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="pl-3">{c.aseguradora}</TableCell>
                        <TableCell className="font-mono">{c.codigo}</TableCell>
                        <TableCell>{ROL[c.rol]}</TableCell>
                        <TableCell>
                          <form action={quitarCodigoAccion}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="productorId" value={productor.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Quitar el código ${c.codigo} de ${c.aseguradora}`}
                            >
                              <Trash2 />
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!productor.activo ? null : conLasQueTrabaja.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Para cargar códigos, primero marcá en{" "}
                <Link
                  href="/portal/aseguradoras"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Aseguradoras
                </Link>{" "}
                con cuáles trabajás.
              </p>
            ) : (
              <AgregarCodigo
                productorId={productor.id}
                aseguradoras={conLasQueTrabaja.map((a) => ({ id: a.id, nombre: a.nombre }))}
                roles={roles}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
