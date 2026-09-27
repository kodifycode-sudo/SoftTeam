import { Bell } from "lucide-react";
import Link from "next/link";
import { EstructuraPanel } from "@/components/panel/estructura";
import {
  oficinaDeCompra,
  puedeComprar,
  puedeConfigurar,
  puedeConfigurarEmpresa,
  puedeContratar,
  requerirCliente,
} from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { avisosSinLeer } from "@/server/modules/procesos/alertas";
import { cantidadEnCarrito } from "@/server/modules/ventas/carrito";
import { AccesoCarrito } from "./compra/agregar";
import { SelectorEmpresa } from "./selector-empresa";

export default async function LayoutPortal({ children }: LayoutProps<"/portal">) {
  const contexto = await requerirCliente();
  const comercial = puedeComprar(contexto);
  const contrata = puedeContratar(contexto);
  const db = await obtenerDb();
  const [enCarrito, avisos] = await Promise.all([
    contrata ? cantidadEnCarrito(db, contexto.empresaId, oficinaDeCompra(contexto)) : 0,
    avisosSinLeer(db, contexto.empresaId, contexto.alcance),
  ]);
  const rol = contexto.adminGeneral
    ? "Administrador general"
    : contexto.alcanceNombre
      ? `Administrador delegado · ${contexto.alcanceNombre}`
      : contexto.adminComercial
        ? "Administrador comercial"
        : "Administrador operativo";

  return (
    <EstructuraPanel
      variante="portal"
      usuario={{ nombre: contexto.nombreUsuario, email: contexto.email, rol }}
      permisos={[
        ...(comercial ? ["comercial"] : []),
        ...(puedeConfigurar(contexto) ? ["configuracion"] : []),
        ...(puedeConfigurarEmpresa(contexto) ? ["configuracion-empresa"] : []),
      ]}
      extraBarra={
        contexto.empresas.length > 1 ? (
          <SelectorEmpresa empresas={contexto.empresas} actual={contexto.empresaId} />
        ) : undefined
      }
      encabezado={
        <>
          <span className="truncate text-sm">
            <span className="font-medium">{contexto.empresaNombre}</span>
            <span className="hidden text-muted-foreground sm:inline">
              {" "}
              · Empresa #{contexto.empresaNumero}
            </span>
            {contexto.alcanceNombre && (
              <span className="ml-2 hidden rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-xs font-medium md:inline">
                {contexto.alcanceNombre}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Link
              href="/portal/avisos"
              className="relative inline-flex size-9 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-muted"
              aria-label={avisos ? `Avisos: ${avisos} sin leer` : "Avisos"}
            >
              <Bell className="size-4" />
              {avisos > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[0.7rem] font-bold text-white tabular-nums">
                  {avisos > 99 ? "99+" : avisos}
                </span>
              )}
            </Link>
            {contrata && <AccesoCarrito cantidad={enCarrito} />}
          </span>
        </>
      }
    >
      {children}
    </EstructuraPanel>
  );
}
