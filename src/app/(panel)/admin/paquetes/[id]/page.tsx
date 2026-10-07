import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { aTextoDecimal } from "@/domain/dinero";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { obtenerPaquete, recursosPorProducto } from "@/server/modules/catalogo/paquetes";
import { FormularioPaquete } from "../formulario";

export const metadata: Metadata = { title: "Editar paquete" };

export default async function EditarPaquete({ params }: PageProps<"/admin/paquetes/[id]">) {
  await requerirSofteam(["ADMINISTRACION"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await obtenerDb();
  const [paquete, productos] = await Promise.all([obtenerPaquete(db, id), recursosPorProducto(db)]);
  if (!paquete) notFound();

  return (
    <>
      <EncabezadoPagina
        migas={[{ texto: "Paquetes", href: "/admin/paquetes" }, { texto: paquete.nombre }]}
        etiqueta={paquete.codigo}
        titulo={`Editar ${paquete.nombre}`}
        descripcion="Los cambios aplican a las contrataciones nuevas. Los contratos existentes conservan sus límites y precios."
      />
      <FormularioPaquete
        productos={productos}
        inicial={{
          id: paquete.id,
          codigo: paquete.codigo,
          nombre: paquete.nombre,
          descripcion: paquete.descripcion ?? "",
          tipo: paquete.tipo,
          privado: paquete.privado,
          destacado: paquete.destacado,
          activo: paquete.activo,
          ventaDesde: paquete.ventaDesde,
          ventaHasta: paquete.ventaHasta ?? "",
          recursos: Object.fromEntries(paquete.recursos.map((r) => [r.recursoId, r.cantidad])),
          alternativas: paquete.alternativas
            .filter((a) => a.activa)
            .map((a) => ({
              id: a.id,
              clave: a.id,
              nombre: a.nombre,
              meses: a.meses === null ? "" : String(a.meses),
              precioCompra: aTextoDecimal(a.precioCompra),
              precioRenovacion: aTextoDecimal(a.precioRenovacion),
              activa: a.activa,
            })),
        }}
      />
    </>
  );
}
