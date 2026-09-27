import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { requerirConfiguracionEmpresa } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { leerPoliticas } from "@/server/modules/configuracion/politicas";
import { FormularioPoliticas } from "./formulario";

export const metadata: Metadata = { title: "Políticas" };

export default async function PaginaPoliticas() {
  const contexto = await requerirConfiguracionEmpresa();
  const politicas = await leerPoliticas(await obtenerDb(), contexto.empresaId);
  return (
    <>
      <EncabezadoPagina
        titulo="Políticas"
        descripcion="Reglas de la empresa para sus oficinas. Los productos las aplican al consumir."
      />
      <FormularioPoliticas politicas={politicas} />
    </>
  );
}
