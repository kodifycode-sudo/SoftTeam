/** Sufijos de tipo societario que no distinguen a una razón social de su nombre comercial. */
const SUFIJOS = new Set(["sa", "srl", "sas", "sau", "sca", "scs", "sc", "sh", "ltda", "cia"]);

function normalizar(nombre: string): string {
  const palabras = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b([a-z])\.(?=[a-z]\.)/g, "$1") // "s.a." → "sa."
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (palabras.length > 1 && SUFIJOS.has(palabras.at(-1) ?? "")) palabras.pop();
  return palabras.join(" ");
}

/**
 * ¿Son el mismo nombre a la vista? "Broker del Sur" y "Broker del Sur S.A."
 * sí; "Andino Mendoza" y "Andino Seguros SRL" no. Sirve para no repetir el
 * cliente debajo de una empresa que se llama igual.
 */
export function nombresEquivalentes(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b);
}
