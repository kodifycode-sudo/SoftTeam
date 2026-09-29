import "server-only";

/**
 * Quien emite los comprobantes. La razón social y el mail son fijos; el CUIT
 * y el domicilio se configuran por entorno (van en los recibos).
 */
export const EMISOR = {
  marca: "SOFTeam Sistemas",
  razonSocial: "de Contacto Asegurado SRL",
  cuit: process.env.STLIC_EMISOR_CUIT ?? null,
  domicilio: process.env.STLIC_EMISOR_DOMICILIO ?? null,
  email: "administracion@softeam.com.ar",
};
