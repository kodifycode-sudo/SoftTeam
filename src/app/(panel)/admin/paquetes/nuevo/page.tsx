import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { hoy } from "@/domain/fecha";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { recursosPorProducto } from "@/server/modules/catalogo/paquetes";
import { FormularioPaquete } from "../formulario";

export const metadata: Metadata = { title: "Nuevo paquete" };

export default async function NuevoPaquete() {
  await requerirSofteam(["ADMINISTRACION"]);
  const db = await obtenerDb();
  const productos = await recursosPorProducto(db);
  return (
    <>
      <EncabezadoPagina
        migas={[{ texto: "Paquetes", href: "/admin/paquetes" }, { texto: "Nuevo paquete" }]}
        titulo="Nuevo paquete"
        descripcion="Definí qué incluye y cuánto cuesta."
      />
      <FormularioPaquete
        productos={productos}
        inicial={{
          codigo: "",
          nombre: "",
          descripcion: "",
          tipo: "TEMPORAL",
          privado: false,
          destacado: false,
          activo: true,
          ventaDesde: hoy(),
          ventaHasta: "",
          recursos: {},
          alternativas: [],
        }}
      />
    </>
  );
}
