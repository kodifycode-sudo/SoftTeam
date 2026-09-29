import { MapPin, MapPinned, Phone, Receipt, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { puedeComprar, requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  pedidoFacturacionHabilitado,
  pedidosPendientes,
} from "@/server/modules/cuentas/facturacion-oficinas";
import { listarCanales, listarOficinas } from "@/server/modules/cuentas/oficinas";
import { EditarOficina, RenombrarCanal } from "./editar-oficina";
import { NuevaOficina } from "./nueva-oficina";
import { FacturacionDeOficina } from "./pedir-facturacion";

export const metadata: Metadata = { title: "Oficinas" };

export default async function PaginaOficinas() {
  const contexto = await requerirCliente();
  const db = await obtenerDb();
  // Quien administra paquetes y pagos puede pedir que otra razón social pague una
  // oficina, si el parámetro "oficinas.pedido_facturacion" lo habilita.
  const comercial = puedeComprar(contexto) && (await pedidoFacturacionHabilitado(db));
  const [oficinas, canales, pedidos] = await Promise.all([
    listarOficinas(db, contexto.empresaId, contexto.alcance),
    listarCanales(db, contexto.empresaId),
    comercial ? pedidosPendientes(db, [contexto.empresaId]) : [],
  ]);
  const { alcance } = contexto;
  // Un delegado de oficina solo ve la suya; uno de canal puede sumar oficinas a su canal.
  const puedeConfigurar =
    (contexto.adminGeneral || contexto.adminOperativo) && alcance.tipo !== "oficina";
  // Editar oficinas: permiso de configuración, dentro del alcance (lista ya filtrada).
  const editaOficinas = contexto.adminGeneral || contexto.adminOperativo;
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
              {editaOficinas &&
                (alcance.tipo === "empresa" ||
                  (alcance.tipo === "canal" && alcance.canalId === canal.id)) && (
                  <RenombrarCanal
                    canal={{ id: canal.id, codigo: canal.codigo, nombre: canal.nombre }}
                  />
                )}
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
                    <div className="flex items-center gap-1">
                      {!o.activa && <Badge variant="destructive">Inactiva</Badge>}
                      {editaOficinas && (
                        <EditarOficina
                          puedeDesactivar={alcance.tipo !== "oficina"}
                          oficina={{
                            id: o.id,
                            codigo: `${canal.codigo}-${o.codigo}`,
                            nombre: o.nombre,
                            telefono: o.telefono,
                            whatsapp: o.whatsapp,
                            domicilio: o.domicilio,
                            redes: o.redes,
                            activa: o.activa,
                          }}
                        />
                      )}
                    </div>
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
                    {o.facturaA && (
                      <p className="flex items-center gap-2">
                        <Receipt className="size-3.5" /> Sus compras se facturan a {o.facturaA}
                      </p>
                    )}
                  </div>
                  {comercial && (
                    <FacturacionDeOficina
                      oficinaId={o.id}
                      oficina={`${canal.codigo}-${o.codigo} ${o.nombre}`}
                      pedido={
                        pedidos
                          .filter((p) => p.oficinaId === o.id)
                          .map((p) => ({ id: p.id, cuit: p.cuit }))[0] ?? null
                      }
                    />
                  )}
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
