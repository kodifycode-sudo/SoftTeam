import { MapPin, MapPinned, Phone, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { listarCanales, listarOficinas } from "@/server/modules/cuentas/oficinas";
import { NuevaOficina } from "./nueva-oficina";

export const metadata: Metadata = { title: "Oficinas" };

export default async function PaginaOficinas() {
  const contexto = await requerirCliente();
  const db = await obtenerDb();
  const [oficinas, canales] = await Promise.all([
    listarOficinas(db, contexto.empresaId, contexto.alcance),
    listarCanales(db, contexto.empresaId),
  ]);
  const { alcance } = contexto;
  // Un delegado de oficina solo ve la suya; uno de canal puede sumar oficinas a su canal.
  const puedeConfigurar =
    (contexto.adminGeneral || contexto.adminOperativo) && alcance.tipo !== "oficina";
  const canalesPropios =
    alcance.tipo === "canal" ? canales.filter((c) => c.id === alcance.canalId) : canales;
  const porCanal = canales
    .map((c) => ({ ...c, oficinas: oficinas.filter((o) => o.canalId === c.id) }))
    .filter((c) => c.oficinas.length > 0);

  return (
    <>
      <EncabezadoPagina
        titulo="Oficinas"
        descripcion={
          contexto.alcanceNombre
            ? `Las oficinas que administrás (${contexto.alcanceNombre}).`
            : "Las oficinas se agrupan en canales. Sirven para limitar qué ve cada usuario y para repartir los consumos."
        }
        acciones={
          puedeConfigurar && (
            <NuevaOficina
              canales={canalesPropios.map((c) => ({
                id: c.id,
                codigo: c.codigo,
                nombre: c.nombre,
              }))}
              permitirCanalNuevo={alcance.tipo === "empresa"}
            />
          )
        }
      />

      <div className="space-y-8">
        {porCanal.map((canal) => (
          <section key={canal.id}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Badge variant="outline" className="font-mono">
                {canal.codigo}
              </Badge>
              {canal.nombre}
              <span className="font-normal text-muted-foreground">
                · {canal.oficinas.length} oficina{canal.oficinas.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {canal.oficinas.map((o) => (
                <Card key={o.id} className="gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <MapPinned className="size-5" />
                      </span>
                      <div>
                        <p className="font-medium">{o.nombre}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {canal.codigo}-{o.codigo}
                        </p>
                      </div>
                    </div>
                    {!o.activa && <Badge variant="destructive">Inactiva</Badge>}
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {o.domicilio && (
                      <p className="flex items-center gap-2">
                        <MapPin className="size-3.5" /> {o.domicilio}
                      </p>
                    )}
                    {o.telefono && (
                      <p className="flex items-center gap-2">
                        <Phone className="size-3.5" /> {o.telefono}
                      </p>
                    )}
                    <p className="flex items-center gap-2">
                      <UsersRound className="size-3.5" /> {o.colaboradores} usuario
                      {o.colaboradores === 1 ? "" : "s"}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
