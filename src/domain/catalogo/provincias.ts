/*
 * Código corto de una provincia, generado a partir del nombre. Se usa para
 * mostrar y exportar (los domicilios guardan el nombre), así que solo tiene
 * que ser legible y único dentro del país.
 */

/** Largo máximo del código (la columna admite 5). */
const LARGO_MAXIMO = 5;

/** Palabras que no aportan a las iniciales ("Tierra del Fuego" → TF). */
const CONECTORES = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E"]);

const VOCALES = new Set(["A", "E", "I", "O", "U"]);

function palabras(nombre: string): string[] {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Opciones en orden de preferencia: la primera libre es el código. */
function candidatos(nombre: string): string[] {
  const todas = palabras(nombre);
  // Los conectores del medio no cuentan ("Tierra del Fuego" → TF); el artículo
  // inicial sí ("La Pampa" → LP).
  const significativas = todas.filter((p, i) => i === 0 || !CONECTORES.has(p));
  const base = significativas.length > 0 ? significativas : todas;
  const unida = base.join("");
  const opciones: string[] = [];
  if (base.length > 1) {
    // Varias palabras: sus iniciales ("Santa Fe" → SF), o la primera palabra
    // con la inicial de las demás ("San Juan" → SAJ, si SJ ya está).
    opciones.push(base.map((p) => p[0]).join(""));
    opciones.push(
      (base[0] ?? "").slice(0, 2) +
        base
          .slice(1)
          .map((p) => p[0])
          .join(""),
    );
  }
  // Una palabra: las tres primeras letras ("Mendoza" → MEN)…
  opciones.push(unida.slice(0, 3));
  // …o la inicial con las consonantes que siguen ("Corrientes" → CRR, si COR ya está).
  const consonantes = [...unida.slice(1)].filter((c) => !VOCALES.has(c)).join("");
  opciones.push((unida[0] ?? "") + consonantes.slice(0, 2));
  opciones.push(unida.slice(0, 2) + unida.slice(-1));
  opciones.push(unida.slice(0, 4));
  return opciones
    .map((o) => o.slice(0, LARGO_MAXIMO))
    .filter((o) => o.length >= 2 || (o.length === 1 && unida.length === 1));
}

/**
 * Código para una provincia nueva: el primer candidato que no use otra
 * provincia del país; si todos están tomados, el primero con un número.
 */
export function codigoProvincia(nombre: string, usados: Iterable<string>): string {
  const tomados = new Set([...usados].map((c) => c.toUpperCase()));
  const opciones = candidatos(nombre);
  const libre = opciones.find((o) => !tomados.has(o));
  if (libre) return libre;
  const base = (opciones[0] ?? "P").slice(0, LARGO_MAXIMO - 1);
  for (let n = 2; n < 100; n++) {
    const conNumero = `${base.slice(0, LARGO_MAXIMO - String(n).length)}${n}`;
    if (!tomados.has(conNumero)) return conNumero;
  }
  throw new Error(`No hay un código libre para la provincia "${nombre}"`);
}
