import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { nombresDeProvincias } from "@/server/modules/catalogo/paises";
import { FormularioAltaCliente } from "./formulario";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NuevoCliente() {
  await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const provincias = await nombresDeProvincias(await obtenerDb(), "AR");
  return (
    <>
      <EncabezadoPagina
        migas={[{ texto: "Clientes", href: "/admin/clientes" }, { texto: "Nuevo cliente" }]}
        titulo="Nuevo cliente"
        descripcion="Para quien no se registra solo (por ejemplo, un corporativo). Crea el cliente, su empresa con la oficina Casa central y el administrador."
      />
      <div className="max-w-4xl">
        <FormularioAltaCliente provincias={provincias} />
      </div>
    </>
  );
}
