import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { buttonVariants } from "@/components/ui/button";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import * as t from "@/server/db/schema";
import { FormularioCliente } from "./formulario";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditarCliente({ params }: PageProps<"/admin/clientes/[id]/editar">) {
  const { rol } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await obtenerDb();
  const [cliente, grupos, medios] = await Promise.all([
    db.query.clientes.findFirst({ where: eq(t.clientes.id, id) }),
    db
      .select({ id: t.gruposEconomicos.id, nombre: t.gruposEconomicos.nombre })
      .from(t.gruposEconomicos)
      .orderBy(asc(t.gruposEconomicos.nombre)),
    db
      .select({ id: t.mediosPago.id, nombre: t.mediosPago.nombre })
      .from(t.mediosPago)
      .where(eq(t.mediosPago.activo, true))
      .orderBy(asc(t.mediosPago.orden)),
  ]);
  if (!cliente) notFound();

  return (
    <>
      <Link
        href={`/admin/clientes/${cliente.id}`}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-3" })}
      >
        <ArrowLeft data-icon="inline-start" /> {cliente.nombre}
      </Link>
      <EncabezadoPagina
        etiqueta={`Cliente #${cliente.numero}`}
        titulo="Editar datos del cliente"
        descripcion="Los cambios quedan en la auditoría con el valor anterior."
      />
      <div className="max-w-4xl">
        <FormularioCliente
          administracion={rol === "ADMINISTRACION"}
          grupos={grupos}
          medios={medios}
          cliente={{
            id: cliente.id,
            version: cliente.actualizadoEn.toISOString(),
            tipoPersona: cliente.tipoPersona,
            nombre: cliente.nombre,
            tipoSociedad: cliente.tipoSociedad,
            nombreFactura: cliente.nombreFactura,
            cuit: cliente.cuit,
            condicionIva: cliente.condicionIva,
            domicilioFiscal: cliente.domicilioFiscal,
            domicilioComercial: cliente.domicilioComercial,
            contactoAdministrador: cliente.contactoAdministrador,
            contactoPagos: cliente.contactoPagos,
            contactoComercial: cliente.contactoComercial,
            grupoId: cliente.grupoId,
            medioPagoAltaId: cliente.medioPagoAltaId,
            medioPagoRenovacionId: cliente.medioPagoRenovacionId,
            xubioId: cliente.xubioId,
            observacionFactura: cliente.observacionFactura,
            observaciones: cliente.observaciones,
            activo: cliente.activo,
          }}
        />
      </div>
    </>
  );
}
