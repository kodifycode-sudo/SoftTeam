/*
 * Datos del responsable que citan los textos legales. Están en un solo lugar
 * para que legales los revise y complete (domicilio, CUIT, mail de contacto)
 * sin tocar las páginas.
 */
export const RESPONSABLE = {
  razonSocial: "Sistemas de Contacto Asegurado SRL",
  marca: "SOFTeam",
  sitio: "https://softeam.com.ar/st/",
  sitioTexto: "softeam.com.ar",
} as const;

/** Fecha que se muestra como "Última actualización" en términos y privacidad. */
export const ACTUALIZACION_LEGAL = "2026-10-06";
