"use client";

import {
  Building2,
  CreditCard,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  MapPinned,
  Package,
  PackageSearch,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MarcaStlic } from "@/components/marca";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { MenuUsuario, type UsuarioMenu } from "./menu-usuario";

interface ItemNavegacion {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Activo solo con coincidencia exacta (para la ruta raíz de cada panel). */
  exacto?: boolean;
}

const NAVEGACION: Record<"admin" | "portal", { titulo: string; items: ItemNavegacion[] }[]> = {
  admin: [
    {
      titulo: "General",
      items: [{ href: "/admin", etiqueta: "Tablero", icono: LayoutDashboard, exacto: true }],
    },
    {
      titulo: "Cuentas",
      items: [{ href: "/admin/clientes", etiqueta: "Clientes", icono: UsersRound }],
    },
    {
      titulo: "Catálogo",
      items: [
        { href: "/admin/paquetes", etiqueta: "Paquetes", icono: Package },
        { href: "/admin/medios-pago", etiqueta: "Medios de pago", icono: CreditCard },
      ],
    },
  ],
  portal: [
    {
      titulo: "Mi cuenta",
      items: [
        { href: "/portal", etiqueta: "Inicio", icono: Gauge, exacto: true },
        { href: "/portal/paquetes", etiqueta: "Paquetes disponibles", icono: PackageSearch },
      ],
    },
    {
      titulo: "Organización",
      items: [
        { href: "/portal/empresa", etiqueta: "Mi empresa", icono: Building2 },
        { href: "/portal/oficinas", etiqueta: "Oficinas", icono: MapPinned },
      ],
    },
  ],
};

export function BarraLateral({
  variante,
  usuario,
  pie,
}: {
  variante: "admin" | "portal";
  usuario: UsuarioMenu;
  pie?: React.ReactNode;
}) {
  const ruta = usePathname();
  const { setOpenMobile } = useSidebar();
  const activo = (item: ItemNavegacion) =>
    item.exacto ? ruta === item.href : ruta === item.href || ruta.startsWith(`${item.href}/`);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-3 py-4">
        <Link
          href={variante === "admin" ? "/admin" : "/portal"}
          className="text-sidebar-accent-foreground"
        >
          <MarcaStlic className="group-data-[collapsible=icon]:hidden" />
          <MarcaStlic compacta className="hidden group-data-[collapsible=icon]:flex" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {pie}
        {NAVEGACION[variante].map((seccion) => (
          <SidebarGroup key={seccion.titulo}>
            <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase tracking-wider text-[0.68rem]">
              {seccion.titulo}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {seccion.items.map((item) => {
                  const esActivo = activo(item);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={esActivo}
                        tooltip={item.etiqueta}
                        className="relative h-9 data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground data-active:before:absolute data-active:before:inset-y-1.5 data-active:before:left-0 data-active:before:w-1 data-active:before:rounded-full data-active:before:bg-sidebar-primary"
                        render={<Link href={item.href} onClick={() => setOpenMobile(false)} />}
                      >
                        <item.icono className={esActivo ? "text-sidebar-primary" : undefined} />
                        <span>{item.etiqueta}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <MenuUsuario usuario={usuario} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
