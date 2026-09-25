import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { buttonVariants } from "@/components/ui/button";
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
      <Link
        href="/admin/paquetes"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-3" })}
      >
        <ArrowLeft data-icon="inline-start" /> Paquetes
      </Link>
      <EncabezadoPagina titulo="Nuevo paquete" descripcion="Definí qué incluye y cuánto cuesta." />
      <FormularioPaquete
        productos={productos}
        inicial={{
          codigo: "",
          nombre: "",
          descripcion: "",
          tipo: "TEMPORAL",
          privado: false,
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
