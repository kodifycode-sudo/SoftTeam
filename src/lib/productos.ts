import {
  BellRing,
  Calculator,
  FolderKanban,
  LifeBuoy,
  type LucideIcon,
  Mails,
  Newspaper,
  Smartphone,
} from "lucide-react";

/** Identidad visual de cada producto (ícono y color de acento). */
export const PRODUCTOS_UI: Record<string, { nombre: string; icono: LucideIcon; clase: string }> = {
  prodigal: { nombre: "Prodigal", icono: FolderKanban, clase: "bg-primary/10 text-primary" },
  cotiweb: {
    nombre: "CotiWeb",
    icono: Calculator,
    clase:
      "bg-[oklch(0.65_0.12_190/0.12)] text-[oklch(0.5_0.1_190)] dark:text-[oklch(0.75_0.1_190)]",
  },
  bienseguro: {
    nombre: "BienSeguro",
    icono: Smartphone,
    clase: "bg-success/10 text-success",
  },
  boletin: {
    nombre: "Boletín@",
    icono: Newspaper,
    clase: "bg-destructive/10 text-destructive",
  },
  notificaciones: {
    nombre: "Notificaciones",
    icono: BellRing,
    clase: "bg-brand/20 text-[oklch(0.5_0.13_75)] dark:text-brand",
  },
  mailing: {
    nombre: "Mail marketing",
    icono: Mails,
    clase: "bg-secondary text-secondary-foreground",
  },
  soporte: {
    nombre: "Soporte técnico",
    icono: LifeBuoy,
    clase: "bg-primary/10 text-primary",
  },
};

export const productoUI = (id: string) =>
  PRODUCTOS_UI[id] ?? { nombre: id, icono: FolderKanban, clase: "bg-muted text-muted-foreground" };

/**
 * Los productos que se contratan desde el portal, como se presentan en la
 * portada y en el acceso: una sola lista para que no diverjan.
 */
export const PRODUCTOS_PRINCIPALES = [
  { id: "prodigal", detalle: "Gestión de cartera" },
  { id: "cotiweb", detalle: "Multicotización y emisión" },
  { id: "bienseguro", detalle: "Portal y app para asegurados" },
  { id: "boletin", detalle: "Comunicación con tus clientes" },
].map((p) => ({ ...p, ...productoUI(p.id) }));
