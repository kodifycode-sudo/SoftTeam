import { ArrowLeft, Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { SelectNativo } from "@/components/select-nativo";
import {
  Conversacion,
  ESTADOS_INCIDENTE,
  EstadoIncidente,
  PRIORIDADES,
} from "@/components/soporte/conversacion";
import { ResponderIncidente } from "@/components/soporte/responder";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fechaCorta } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarUsuariosSofteam } from "@/server/modules/cuentas/usuarios-softeam";
import { obtenerIncidente, PRODUCTOS_SOPORTE } from "@/server/modules/soporte/incidentes";
import {
  asignarSoporteAccion,
  cambiarEstadoSoporteAccion,
  responderSofteamAccion,
} from "../acciones";

export const metadata: Metadata = { title: "Pedido de soporte" };

export default async function PedidoSoporteAdmin({ params }: PageProps<"/admin/soporte/[id]">) {
  const { user, rol } = await requerirSofteam();
  const { id } = await params;
  const db = await obtenerDb();
  const [incidente, equipo] = await Promise.all([
    obtenerIncidente(db, id, {}),
    listarUsuariosSofteam(db),
  ]);
  if (!incidente) notFound();
  const atiende = rol === "ADMINISTRACION" || rol === "SOPORTE";
  const cerrado = incidente.estado === "CERRADO";
  const prioridad = PRIORIDADES[incidente.prioridad];

  return (
    <>
      <Link
        href="/admin/soporte"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-3" })}
      >
        <ArrowLeft data-icon="inline-start" /> Soporte
      </Link>
      <EncabezadoPagina
        etiqueta={
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-4" /> {incidente.empresa} · Empresa #
            {incidente.empresaNumero}
          </span>
        }
        titulo={`#${incidente.numero} · ${incidente.asunto}`}
        acciones={
          <>
            <Badge variant="outline" className={prioridad.clase}>
              Prioridad {prioridad.etiqueta.toLowerCase()}
            </Badge>
            <EstadoIncidente estado={incidente.estado} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:items-start">
        <Card>
          <CardContent className="space-y-6">
            <Conversacion
              mensajes={incidente.mensajes}
              vista="softeam"
              rutaAdjuntos="/admin/soporte/adjuntos"
            />
            {atiende && !cerrado && (
              <div className="border-t pt-6">
                <ResponderIncidente
                  incidenteId={incidente.id}
                  accion={responderSofteamAccion}
                  permitirInterno
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Datos del pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <dl className="grid gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Producto</dt>
                <dd>
                  {PRODUCTOS_SOPORTE[incidente.producto as keyof typeof PRODUCTOS_SOPORTE] ??
                    incidente.producto}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Abierto por</dt>
                <dd>
                  {incidente.creadoPor} · {fechaCorta(incidente.creadoEn)}
                </dd>
              </div>
            </dl>
            {atiende && (
              <>
                <form action={asignarSoporteAccion} className="space-y-2">
                  <input type="hidden" name="incidenteId" value={incidente.id} />
                  <label htmlFor="usuarioId" className="text-xs text-muted-foreground">
                    Asignado a
                  </label>
                  <div className="flex gap-2">
                    <SelectNativo
                      id="usuarioId"
                      name="usuarioId"
                      defaultValue={incidente.asignadoAId ?? ""}
                      key={incidente.asignadoAId ?? "sin"}
                    >
                      <option value="">Sin asignar</option>
                      {equipo
                        .filter((u) => u.rol === "SOPORTE" || u.rol === "ADMINISTRACION")
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.id === user.id ? `${u.nombre} (yo)` : u.nombre}
                          </option>
                        ))}
                    </SelectNativo>
                    <Button type="submit" variant="secondary" size="sm">
                      Asignar
                    </Button>
                  </div>
                </form>
                <form action={cambiarEstadoSoporteAccion} className="space-y-2">
                  <input type="hidden" name="incidenteId" value={incidente.id} />
                  <label htmlFor="estado" className="text-xs text-muted-foreground">
                    Estado
                  </label>
                  <div className="flex gap-2">
                    <SelectNativo
                      id="estado"
                      name="estado"
                      defaultValue={incidente.estado}
                      key={incidente.estado}
                    >
                      {Object.entries(ESTADOS_INCIDENTE).map(([valor, e]) => (
                        <option key={valor} value={valor}>
                          {e.etiqueta}
                        </option>
                      ))}
                    </SelectNativo>
                    <Button type="submit" variant="secondary" size="sm">
                      Cambiar
                    </Button>
                  </div>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
