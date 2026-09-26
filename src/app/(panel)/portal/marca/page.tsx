import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { requerirConfiguracion } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { leerMarca } from "@/server/modules/configuracion/marca";
import { FormularioMarca } from "./formulario";

export const metadata: Metadata = { title: "Marca" };

export default async function PaginaMarca() {
  const contexto = await requerirConfiguracion();
  const marca = await leerMarca(await obtenerDb(), contexto.empresaId);
  return (
    <>
      <EncabezadoPagina
        titulo="Marca"
        descripcion="Tu marca en los productos: BienSeguro, el Boletín y los avisos a tus asegurados muestran tu logo, tus colores y tus datos."
      />
      <FormularioMarca
        inicial={{
          nombreComercial: marca?.nombreComercial ?? "",
          eslogan: marca?.eslogan ?? "",
          colorPrimario: marca?.colorPrimario ?? "",
          colorSecundario: marca?.colorSecundario ?? "",
          textoBienvenida: marca?.textoBienvenida ?? "",
          firmaMail: marca?.firmaMail ?? "",
          web: marca?.web ?? "",
          email: marca?.email ?? "",
          telefono: marca?.telefono ?? "",
          whatsapp: marca?.whatsapp ?? "",
          logoUrl: marca?.logoHash ? `/portal/marca/logo?v=${marca.logoHash.slice(0, 16)}` : null,
        }}
      />
    </>
  );
}
