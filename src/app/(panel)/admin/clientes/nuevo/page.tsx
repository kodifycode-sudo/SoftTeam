import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { buttonVariants } from "@/components/ui/button";
import { requerirSofteam } from "@/server/auth/sesion";
import { FormularioAltaCliente } from "./formulario";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NuevoCliente() {
  await requerirSofteam(["ADMINISTRACION", "COMERCIAL"]);
  return (
    <>
      <Link
        href="/admin/clientes"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 mb-3" })}
      >
        <ArrowLeft data-icon="inline-start" /> Clientes
      </Link>
      <EncabezadoPagina
        titulo="Nuevo cliente"
        descripcion="Para quien no se registra solo (por ejemplo, un corporativo). Crea el cliente, su empresa con la oficina Casa central y el administrador."
      />
      <div className="max-w-4xl">
        <FormularioAltaCliente />
      </div>
    </>
  );
}
