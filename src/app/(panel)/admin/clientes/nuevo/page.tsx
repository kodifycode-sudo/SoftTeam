import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { opcionesCondicionesIva } from "@/server/modules/catalogo/condiciones-iva";
import { opcionesEmisores } from "@/server/modules/catalogo/emisores";
import { nombresDeProvincias } from "@/server/modules/catalogo/paises";
import { FormularioAltaCliente } from "./formulario";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NuevoCliente() {
  const { rol } = await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  const db = await obtenerDb();
  const [provincias, condicionesIva, emisores] = await Promise.all([
    nombresDeProvincias(db, "AR"),
    opcionesCondicionesIva(db, "AR"),
    opcionesEmisores(db),
  ]);
  return (
    <>
      <EncabezadoPagina
        migas={[{ texto: "Clientes", href: "/admin/clientes" }, { texto: "Nuevo cliente" }]}
        titulo="Nuevo cliente"
        descripcion="Para quien no se registra solo (por ejemplo, un corporativo). Crea el cliente, su empresa con la oficina Casa central y el administrador."
      />
      <div className="max-w-4xl">
        <FormularioAltaCliente
          provincias={provincias}
          condicionesIva={condicionesIva}
          emisores={rol === "ADMINISTRACION" ? emisores : null}
        />
      </div>
    </>
  );
}
