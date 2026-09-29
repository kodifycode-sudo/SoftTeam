/*
 * Datos de referencia que la base necesita desde el primer día (la migración
 * 0017 carga los mismos). Después se administran desde el panel de SOFTeam.
 */

export const MONEDAS = [
  { codigo: "ARS", nombre: "Peso argentino", simbolo: "$", cotizacion: "1" },
  { codigo: "USD", nombre: "Dólar estadounidense", simbolo: "US$", cotizacion: null },
];

/** Provincias de Argentina con su código ISO 3166-2 (sin el "AR-"). */
export const PROVINCIAS_ARGENTINA = [
  {
    codigo: "B",
    nombre: "Buenos Aires",
  },
  {
    codigo: "C",
    nombre: "Ciudad Autónoma de Buenos Aires",
  },
  {
    codigo: "K",
    nombre: "Catamarca",
  },
  {
    codigo: "H",
    nombre: "Chaco",
  },
  {
    codigo: "U",
    nombre: "Chubut",
  },
  {
    codigo: "X",
    nombre: "Córdoba",
  },
  {
    codigo: "W",
    nombre: "Corrientes",
  },
  {
    codigo: "E",
    nombre: "Entre Ríos",
  },
  {
    codigo: "P",
    nombre: "Formosa",
  },
  {
    codigo: "Y",
    nombre: "Jujuy",
  },
  {
    codigo: "L",
    nombre: "La Pampa",
  },
  {
    codigo: "F",
    nombre: "La Rioja",
  },
  {
    codigo: "M",
    nombre: "Mendoza",
  },
  {
    codigo: "N",
    nombre: "Misiones",
  },
  {
    codigo: "Q",
    nombre: "Neuquén",
  },
  {
    codigo: "R",
    nombre: "Río Negro",
  },
  {
    codigo: "A",
    nombre: "Salta",
  },
  {
    codigo: "J",
    nombre: "San Juan",
  },
  {
    codigo: "D",
    nombre: "San Luis",
  },
  {
    codigo: "Z",
    nombre: "Santa Cruz",
  },
  {
    codigo: "S",
    nombre: "Santa Fe",
  },
  {
    codigo: "G",
    nombre: "Santiago del Estero",
  },
  {
    codigo: "V",
    nombre: "Tierra del Fuego",
  },
  {
    codigo: "T",
    nombre: "Tucumán",
  },
];
