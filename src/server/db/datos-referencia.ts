/*
 * Datos de referencia que la base necesita desde el primer día (la migración
 * 0017 carga los mismos). Después se administran desde el panel de SOFTeam.
 */

export const MONEDAS = [
  { codigo: "ARS", nombre: "Peso argentino", simbolo: "$", cotizacion: "1" },
  { codigo: "USD", nombre: "Dólar estadounidense", simbolo: "US$", cotizacion: null },
];

/**
 * Provincias de Argentina con el código que genera el sistema a partir del
 * nombre (`codigoProvincia`); la migración 0022 pasó a estos los códigos ISO.
 */
export const PROVINCIAS_ARGENTINA = [
  {
    codigo: "BA",
    nombre: "Buenos Aires",
  },
  {
    codigo: "CABA",
    nombre: "Ciudad Autónoma de Buenos Aires",
  },
  {
    codigo: "CAT",
    nombre: "Catamarca",
  },
  {
    codigo: "CHA",
    nombre: "Chaco",
  },
  {
    codigo: "CHU",
    nombre: "Chubut",
  },
  {
    codigo: "CRD",
    nombre: "Córdoba",
  },
  {
    codigo: "COR",
    nombre: "Corrientes",
  },
  {
    codigo: "ER",
    nombre: "Entre Ríos",
  },
  {
    codigo: "FOR",
    nombre: "Formosa",
  },
  {
    codigo: "JUJ",
    nombre: "Jujuy",
  },
  {
    codigo: "LP",
    nombre: "La Pampa",
  },
  {
    codigo: "LR",
    nombre: "La Rioja",
  },
  {
    codigo: "MEN",
    nombre: "Mendoza",
  },
  {
    codigo: "MIS",
    nombre: "Misiones",
  },
  {
    codigo: "NEU",
    nombre: "Neuquén",
  },
  {
    codigo: "RN",
    nombre: "Río Negro",
  },
  {
    codigo: "SAL",
    nombre: "Salta",
  },
  {
    codigo: "SJ",
    nombre: "San Juan",
  },
  {
    codigo: "SL",
    nombre: "San Luis",
  },
  {
    codigo: "SC",
    nombre: "Santa Cruz",
  },
  {
    codigo: "SF",
    nombre: "Santa Fe",
  },
  {
    codigo: "SE",
    nombre: "Santiago del Estero",
  },
  {
    codigo: "TF",
    nombre: "Tierra del Fuego",
  },
  {
    codigo: "TUC",
    nombre: "Tucumán",
  },
];
