import { asc, eq, isNull, or } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { pesos } from "@/lib/formato";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import * as t from "@/server/db/schema";
import { opcionesEmisores } from "@/server/modules/catalogo/emisores";
import { obtenerCliente } from "@/server/modules/cuentas/consultas";
import { leerParametroDe } from "@/server/modules/parametros";
import { catalogoOrdenManual, renovablesOrdenManual } from "@/server/modules/ventas/orden-manual";
import { FormularioOrdenManual } from "./formulario";
import { SelectorEmpresa } from "./selector-empresa";

export const metadata: Metadata = { title: "Orden manual" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Orden manual de Administración: paquetes
 * privados, bonificaciones, la renovación negociada del trimestre inicial,
 * cualquier medio habilitado y el emisor de la orden.
 */
export default async function PaginaOrdenManual({
  params,
  searchParams,
}: PageProps<"/admin/clientes/[id]/orden-manual">) {
  await requerirSofteam(["ADMINISTRACION"]);
  const [{ id }, { empresa: empresaPedida }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const db = await obtenerDb();
  const cliente = await obtenerCliente(db, id);
  if (!cliente) notFound();
  const activas = cliente.empresas.filter((e) => e.activa);
  const empresa = activas.find((e) => e.id === empresaPedida) ?? activas[0];

  return (
    <>
      <EncabezadoPagina
        migas={[
          { texto: "Clientes", href: "/admin/clientes" },
          { texto: cliente.nombre, href: `/admin/clientes/${cliente.id}` },
          { texto: "Orden manual" },
        ]}
        titulo="Orden manual"
        descripcion="Administración arma la orden: paquetes privados, bonificaciones, la renovación negociada del trimestre y cualquier medio habilitado."
      />
      {!empresa ? (
        <p className="text-sm text-muted-foreground">El cliente no tiene empresas activas.</p>
      ) : (
        <Contenido clienteId={cliente.id} empresas={activas} empresaId={empresa.id} />
      )}
    </>
  );
}

async function Contenido({
  clienteId,
  empresas,
  empresaId,
}: {
  clienteId: string;
  empresas: { id: string; nombre: string; paisId: string }[];
  empresaId: string;
}) {
  const db = await obtenerDb();
  const paisId = empresas.find((e) => e.id === empresaId)?.paisId ?? "AR";
  const [catalogo, renovables, medios, emisores, diasVenc] = await Promise.all([
    catalogoOrdenManual(db, empresaId),
    renovablesOrdenManual(db, empresaId),
    db
      .select({ id: t.mediosPago.id, nombre: t.mediosPago.nombre })
      .from(t.mediosPago)
      .where(or(isNull(t.mediosPago.paisId), eq(t.mediosPago.paisId, paisId)))
      .orderBy(asc(t.mediosPago.orden)),
    opcionesEmisores(db),
    leerParametroDe(db, "renovacion.dias_vencimiento"),
  ]);
  return (
    <div className="space-y-6">
      {empresas.length > 1 && (
        <SelectorEmpresa
          clienteId={clienteId}
          empresas={empresas.map((e) => ({ id: e.id, nombre: e.nombre }))}
          actual={empresaId}
        />
      )}
      <FormularioOrdenManual
        key={empresaId}
        clienteId={clienteId}
        empresaId={empresaId}
        paquetes={catalogo.map((p) => ({
          alternativaId: p.alternativaId,
          etiqueta: `${p.paquete} · ${p.alternativa} · ${pesos(p.precioCompra)}${p.privado ? " · privado" : ""}`,
          consumible: p.tipoPaquete === "CONSUMIBLE",
          saldo: Number(p.saldo),
        }))}
        renovables={renovables.map((r) => ({
          contratoId: r.id,
          etiqueta: `${r.paquete}${r.cantidad > 1 ? ` ×${r.cantidad}` : ""} · vence el ${r.hasta}`,
          trimestreInicial: r.trimestreInicial,
          alternativas: r.alternativas.map((a) => ({ id: a.id, nombre: a.nombre })),
        }))}
        medios={medios}
        emisores={emisores.map((e) => ({ id: e.id, nombre: e.razonSocial }))}
        diasVenc={[...diasVenc]}
      />
    </div>
  );
}
