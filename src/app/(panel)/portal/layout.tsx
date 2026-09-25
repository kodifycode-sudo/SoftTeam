import { EstructuraPanel } from "@/components/panel/estructura";
import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { cantidadEnCarrito } from "@/server/modules/ventas/carrito";
import { AccesoCarrito } from "./compra/agregar";
import { SelectorEmpresa } from "./selector-empresa";

export default async function LayoutPortal({ children }: LayoutProps<"/portal">) {
  const contexto = await requerirCliente();
  const enCarrito = await cantidadEnCarrito(await obtenerDb(), contexto.empresaId);
  const rol = contexto.adminGeneral
    ? "Administrador general"
    : contexto.adminComercial
      ? "Administrador comercial"
      : "Administrador operativo";

  return (
    <EstructuraPanel
      variante="portal"
      usuario={{ nombre: contexto.nombreUsuario, email: contexto.email, rol }}
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
          </span>
          <AccesoCarrito cantidad={enCarrito} />
        </>
      }
    >
      {children}
    </EstructuraPanel>
  );
}
