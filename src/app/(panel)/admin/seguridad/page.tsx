import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/panel/estructura";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { tieneDosFactores } from "@/server/modules/cuentas/dos-factores";
import { DosFactores } from "./dos-factores";

export const metadata: Metadata = { title: "Seguridad de la cuenta" };

export default async function PaginaSeguridad() {
  const { user } = await requerirSofteam();
  const activo = await tieneDosFactores(await obtenerDb(), user.id);
  return (
    <>
      <EncabezadoPagina
        titulo="Seguridad de la cuenta"
        descripcion={`Protegé tu usuario de SOFTeam (${user.email}).`}
      />
      <div className="max-w-4xl">
        <DosFactores activo={activo} />
      </div>
    </>
  );
}
