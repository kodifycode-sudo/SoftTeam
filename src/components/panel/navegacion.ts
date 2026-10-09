import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  ChartColumn,
  CircleHelp,
  CreditCard,
  FileUp,
  Gauge,
  Globe,
  Headset,
  History,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  MapPinned,
  MessagesSquare,
  Network,
  Package,
  PackageSearch,
  Palette,
  Plug,
  Receipt,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TicketPercent,
  UserCog,
  UsersRound,
} from "lucide-react";

export type VariantePanel = "admin" | "portal";

export interface ItemNavegacion {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  /** Activo solo con coincidencia exacta (para la ruta raíz de cada panel). */
  exacto?: boolean;
  /**
   * Roles (SOFTeam) o permisos (cliente: "comercial", "configuracion") que ven
   * la opción. Sin indicar, la ven todos. Solo ordena el menú: cada página y
   * cada acción vuelven a verificar el permiso en el servidor.
   */
  permisos?: readonly string[];
}

const NAVEGACION: Record<VariantePanel, { titulo: string; items: ItemNavegacion[] }[]> = {
  admin: [
    {
      titulo: "General",
      items: [
        { href: "/admin", etiqueta: "Tablero", icono: LayoutDashboard, exacto: true },
        { href: "/admin/reportes", etiqueta: "Reportes", icono: ChartColumn },
      ],
    },
    {
      titulo: "Cuentas",
      items: [
        { href: "/admin/clientes", etiqueta: "Clientes", icono: UsersRound },
        { href: "/admin/grupos", etiqueta: "Grupos económicos", icono: Network },
      ],
    },
    {
      titulo: "Atención",
      items: [{ href: "/admin/soporte", etiqueta: "Soporte", icono: Headset }],
    },
    {
      titulo: "Cobranza",
      items: [
        { href: "/admin/ordenes", etiqueta: "Órdenes", icono: Receipt },
        { href: "/admin/pendientes", etiqueta: "Para negociar", icono: CalendarClock },
      ],
    },
    {
      titulo: "Catálogo",
      items: [
        { href: "/admin/paquetes", etiqueta: "Paquetes", icono: Package },
        { href: "/admin/medios-pago", etiqueta: "Medios de pago", icono: CreditCard },
        { href: "/admin/aseguradoras", etiqueta: "Aseguradoras", icono: ShieldCheck },
        {
          href: "/admin/tickets",
          etiqueta: "Tickets",
          icono: TicketPercent,
          permisos: ["ADMINISTRACION", "COMERCIAL"],
        },
      ],
    },
    {
      titulo: "Sistema",
      items: [
        {
          href: "/admin/usuarios",
          etiqueta: "Usuarios SOFTeam",
          icono: UserCog,
          permisos: ["ADMINISTRACION"],
        },
        {
          href: "/admin/paises",
          etiqueta: "Países y monedas",
          icono: Globe,
        },
        {
          href: "/admin/emisores",
          etiqueta: "Emisores",
          icono: Landmark,
          permisos: ["ADMINISTRACION"],
        },
        {
          href: "/admin/parametros",
          etiqueta: "Parámetros",
          icono: Settings2,
          permisos: ["ADMINISTRACION", "SOPORTE"],
        },
        {
          href: "/admin/importar",
          etiqueta: "Importar datos",
          icono: FileUp,
          permisos: ["ADMINISTRACION"],
        },
        {
          href: "/admin/procesos",
          etiqueta: "Procesos y alertas",
          icono: CalendarClock,
          permisos: ["ADMINISTRACION", "SOPORTE"],
        },
        {
          href: "/admin/auditoria",
          etiqueta: "Auditoría",
          icono: History,
          permisos: ["ADMINISTRACION", "SOPORTE"],
        },
        {
          href: "/admin/integraciones",
          etiqueta: "Integraciones",
          icono: Plug,
          permisos: ["ADMINISTRACION", "SOPORTE"],
        },
      ],
    },
  ],
  portal: [
    {
      titulo: "Mi cuenta",
      items: [
        { href: "/portal", etiqueta: "Inicio", icono: Gauge, exacto: true },
        { href: "/portal/avisos", etiqueta: "Avisos", icono: Bell },
        { href: "/portal/consumos", etiqueta: "Consumos", icono: Activity },
        { href: "/portal/soporte", etiqueta: "Soporte", icono: LifeBuoy },
        { href: "/portal/ayuda", etiqueta: "Ayuda", icono: CircleHelp },
        {
          href: "/portal/paquetes",
          etiqueta: "Paquetes disponibles",
          icono: PackageSearch,
          permisos: ["comercial"],
        },
        {
          href: "/portal/ordenes",
          etiqueta: "Mis órdenes",
          icono: Receipt,
          permisos: ["comercial"],
        },
      ],
    },
    {
      titulo: "Organización",
      items: [
        { href: "/portal/empresa", etiqueta: "Mi empresa", icono: Building2 },
        { href: "/portal/oficinas", etiqueta: "Oficinas", icono: MapPinned },
        {
          href: "/portal/usuarios",
          etiqueta: "Usuarios",
          icono: UsersRound,
          permisos: ["configuracion"],
        },
        {
          href: "/portal/aseguradoras",
          etiqueta: "Aseguradoras",
          icono: ShieldCheck,
          permisos: ["configuracion-empresa"],
        },
        {
          href: "/portal/productores",
          etiqueta: "Productores",
          icono: Briefcase,
          permisos: ["configuracion"],
        },
        {
          href: "/portal/marca",
          etiqueta: "Marca",
          icono: Palette,
          permisos: ["configuracion-empresa"],
        },
        {
          href: "/portal/comunicaciones",
          etiqueta: "Comunicaciones",
          icono: MessagesSquare,
          permisos: ["configuracion-empresa"],
        },
        {
          href: "/portal/politicas",
          etiqueta: "Políticas",
          icono: SlidersHorizontal,
          permisos: ["configuracion-empresa"],
        },
      ],
    },
  ],
};

/** Secciones del menú con las opciones que corresponden a los permisos del usuario. */
export function seccionesVisibles(variante: VariantePanel, permisos: readonly string[]) {
  return NAVEGACION[variante]
    .map((seccion) => ({
      ...seccion,
      items: seccion.items.filter(
        (i) => !i.permisos || i.permisos.some((p) => permisos.includes(p)),
      ),
    }))
    .filter((seccion) => seccion.items.length > 0);
}
