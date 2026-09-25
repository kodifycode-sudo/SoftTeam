/** Roles del panel SOFTeam, con lo que habilita cada uno. */
export const ROLES_SOFTEAM_INFO = {
  ADMINISTRACION: {
    etiqueta: "Administración",
    descripcion: "Todo: catálogo, precios, cobranza, usuarios e integraciones.",
  },
  COMERCIAL: {
    etiqueta: "Comercial",
    descripcion: "Consulta clientes y órdenes, y habilita paquetes.",
  },
  SOPORTE: {
    etiqueta: "Soporte",
    descripcion: "Consulta clientes, auditoría e integraciones.",
  },
} as const;

export type RolSofteamInfo = keyof typeof ROLES_SOFTEAM_INFO;
