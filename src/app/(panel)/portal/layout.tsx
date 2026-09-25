import { EstructuraPanel } from "@/components/panel/estructura";
import { requerirCliente } from "@/server/auth/sesion";
import { SelectorEmpresa } from "./selector-empresa";

export default async function LayoutPortal({ children }: LayoutProps<"/portal">) {
  const contexto = await requerirCliente();
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
        <span className="truncate text-sm">
          <span className="font-medium">{contexto.empresaNombre}</span>
          <span className="text-muted-foreground"> · Empresa #{contexto.empresaNumero}</span>
        </span>
      }
    >
      {children}
    </EstructuraPanel>
  );
}
