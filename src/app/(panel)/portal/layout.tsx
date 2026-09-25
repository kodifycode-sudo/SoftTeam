import { EstructuraPanel } from "@/components/panel/estructura";
import { puedeComprar, puedeConfigurar, requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { cantidadEnCarrito } from "@/server/modules/ventas/carrito";
import { AccesoCarrito } from "./compra/agregar";
import { SelectorEmpresa } from "./selector-empresa";

export default async function LayoutPortal({ children }: LayoutProps<"/portal">) {
  const contexto = await requerirCliente();
  const comercial = puedeComprar(contexto);
  const enCarrito = comercial ? await cantidadEnCarrito(await obtenerDb(), contexto.empresaId) : 0;
  const rol = contexto.adminGeneral
    ? "Administrador general"
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
          </span>
          {comercial && <AccesoCarrito cantidad={enCarrito} />}
        </>
      }
    >
      {children}
    </EstructuraPanel>
  );
}
