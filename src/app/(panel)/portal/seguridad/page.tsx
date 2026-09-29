import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { DosFactores } from "@/components/seguridad/dos-factores";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { tieneDosFactores } from "@/server/modules/cuentas/dos-factores";

export const metadata: Metadata = { title: "Seguridad de la cuenta" };

/** Verificación en dos pasos del administrador: opcional, la decide cada uno. */
export default async function PaginaSeguridadPortal() {
  const contexto = await requerirCliente();
  const activo = await tieneDosFactores(await obtenerDb(), contexto.usuarioId);
  return (
    <>
      <EncabezadoPagina
        titulo="Seguridad de la cuenta"
        descripcion={`Protegé tu usuario (${contexto.email}). Es opcional.`}
      />
      <div className="max-w-4xl">
        <DosFactores
          activo={activo}
          motivo={`Con tu usuario se administran los paquetes, pagos y usuarios de ${contexto.empresaNombre}. Si alguien consigue tu contraseña, sin el código de tu celular no puede entrar.`}
        />
      </div>
    </>
  );
}
