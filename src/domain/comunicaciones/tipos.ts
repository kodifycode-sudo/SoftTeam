/*
 * Tipos de comunicación de una empresa (`TipoComunicacion` de SOFTeam): por qué
 * medios sale cada comunicación y, según quién la origina, a quiénes puede
 * llegar y quién tiene que autorizarla. Los productos de notificaciones
 * (BienSeguro, Boletín) los leen de STLic.
 */

/** Tipos de usuario, con el código que usaba SOFTeam (dominio `TipoUsuario`). */
export const TIPOS_USUARIO = {
  SOFTEAM: { codigo: 1, etiqueta: "Administrador SOFTeam" },
  ADMIN_EMPRESA: { codigo: 7, etiqueta: "Administrador de la empresa" },
  USUARIO_EMPRESA: { codigo: 2, etiqueta: "Usuario de la empresa" },
  ADMIN_CANAL: { codigo: 8, etiqueta: "Administrador de canal" },
  USUARIO_CANAL: { codigo: 9, etiqueta: "Usuario de canal" },
  ADMIN_OFICINA: { codigo: 10, etiqueta: "Administrador de oficina" },
  USUARIO_OFICINA: { codigo: 6, etiqueta: "Usuario de oficina" },
  PRODUCTOR: { codigo: 3, etiqueta: "Productor" },
  SUBPRODUCTOR: { codigo: 4, etiqueta: "Subproductor" },
  ASEGURADO: { codigo: 5, etiqueta: "Asegurado" },
  SOLO_LECTURA: { codigo: 99, etiqueta: "Solo lectura" },
} as const;

export type TipoUsuario = keyof typeof TIPOS_USUARIO;

export const LISTA_TIPOS_USUARIO = Object.keys(TIPOS_USUARIO) as [TipoUsuario, ...TipoUsuario[]];

/** Medios de una comunicación. "portal": aviso interno en el portal del productor. */
export const MEDIOS_COMUNICACION = {
  sistema: "Aviso del sistema",
  portal: "Aviso en el portal",
  mail: "Mail",
  sms: "SMS",
  push: "Notificación push",
  whatsapp: "WhatsApp",
} as const;

export type MedioComunicacion = keyof typeof MEDIOS_COMUNICACION;

export type MediosComunicacion = Record<MedioComunicacion, boolean>;

export interface ReglaComunicacion {
  /** Quién la origina. */
  origen: TipoUsuario;
  /** A quiénes puede llegar. */
  destinos: TipoUsuario[];
  /** Quiénes tienen que autorizarla antes de salir (vacío: no requiere). */
  autorizantes: TipoUsuario[];
}
