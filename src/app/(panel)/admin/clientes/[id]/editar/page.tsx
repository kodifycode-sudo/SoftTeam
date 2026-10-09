import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import * as t from "@/server/db/schema";
import { opcionesCondicionesIva } from "@/server/modules/catalogo/condiciones-iva";
import { opcionesEmisores } from "@/server/modules/catalogo/emisores";
import { mediosPagoActivos } from "@/server/modules/catalogo/medios-pago";
import { nombresDeProvincias } from "@/server/modules/catalogo/paises";
import { opcionesGrupos } from "@/server/modules/cuentas/grupos";
import { FormularioCliente } from "./formulario";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditarCliente({ params }: PageProps<"/admin/clientes/[id]/editar">) {
  const { rol } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await obtenerDb();
  const [cliente, grupos, medios, provincias, condicionesIva, emisores] = await Promise.all([
    db.query.clientes.findFirst({ where: eq(t.clientes.id, id) }),
    opcionesGrupos(db),
    mediosPagoActivos(db),
    // Hoy todos los clientes son de Argentina; con otros países, la del domicilio fiscal.
    nombresDeProvincias(db, "AR"),
    opcionesCondicionesIva(db, "AR"),
    opcionesEmisores(db),
  ]);
  if (!cliente) notFound();
  if (!condicionesIva.some((c) => c.codigo === cliente.condicionIva)) {
    const actual = await db.query.condicionesIva.findFirst({
      columns: { nombre: true },
      where: eq(t.condicionesIva.codigo, cliente.condicionIva),
    });
    condicionesIva.push({
      codigo: cliente.condicionIva,
      nombre: `${actual?.nombre ?? cliente.condicionIva} (dada de baja)`,
    });
  }

  return (
    <>
      <EncabezadoPagina
        migas={[
          { texto: "Clientes", href: "/admin/clientes" },
          { texto: cliente.nombre, href: `/admin/clientes/${cliente.id}` },
          { texto: "Editar datos" },
        ]}
        etiqueta={`Cliente #${cliente.numero}`}
        titulo="Editar datos del cliente"
        descripcion="Los cambios quedan en la auditoría con el valor anterior."
      />
      <div className="max-w-4xl">
        <FormularioCliente
          administracion={rol === "ADMINISTRACION"}
          grupos={grupos}
          medios={medios}
          provincias={provincias}
          condicionesIva={condicionesIva}
          emisores={emisores}
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
            modoFacturacion: cliente.modoFacturacion,
            emisorId: cliente.emisorId,
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
