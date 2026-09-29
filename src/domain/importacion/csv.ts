/*
 * Lectura de archivos de importación. Formato fijo: la primera línea tiene
 * los nombres de los campos (atributos de la KB o nombres propios) y cada
 * línea siguiente, los valores; todo separado por punto y coma (;). Sigue
 * las reglas habituales del CSV: un valor entre comillas puede tener ";" o
 * saltos de línea, y "" dentro de comillas es una comilla.
 */

export const SEPARADOR = ";";

export interface FilaLeida {
  /** Línea del archivo donde empieza la fila (para los mensajes de error). */
  linea: number;
  valores: string[];
}

export interface TablaLeida {
  /** La primera línea no tiene ";" pero sí comas o tabuladores: el archivo no respeta el formato. */
  separadorEquivocado?: "," | "\t";
  titulos: string[];
  filas: FilaLeida[];
}

/**
 * Texto del archivo: UTF-8 si es válido; si no, Windows-1252 (lo que suelen
 * generar Excel y las exportaciones de Windows). Sin la marca BOM.
 */
export function decodificar(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** Si la primera línea no usa ";" pero sí otro separador habitual, cuál. */
function separadorEquivocado(primeraLinea: string): TablaLeida["separadorEquivocado"] {
  const fuera = primeraLinea.replace(/"[^"]*"/g, "");
  if (fuera.includes(SEPARADOR)) return undefined;
  if (fuera.includes("\t")) return "\t";
  return fuera.includes(",") ? "," : undefined;
}

export function leerTabla(texto: string): TablaLeida {
  const fin = texto.search(/\r?\n/);
  const equivocado = separadorEquivocado(fin < 0 ? texto : texto.slice(0, fin));

  const registros: FilaLeida[] = [];
  let valores: string[] = [];
  let valor = "";
  let entreComillas = false;
  let linea = 1;
  let lineaInicio = 1;
  const cerrarValor = () => {
    valores.push(valor.trim());
    valor = "";
  };
  const cerrarFila = () => {
    cerrarValor();
    // Las líneas vacías se ignoran.
    if (valores.some((v) => v !== "")) registros.push({ linea: lineaInicio, valores });
    valores = [];
    lineaInicio = linea;
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i] as string;
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        valor += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        if (c === "\n") linea++;
        valor += c;
      }
    } else if (c === '"' && valor.trim() === "") {
      valor = "";
      entreComillas = true;
    } else if (c === SEPARADOR) {
      cerrarValor();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linea++;
      cerrarFila();
    } else {
      valor += c;
    }
  }
  if (valor !== "" || valores.length > 0) cerrarFila();

  const [cabecera, ...filas] = registros;
  return {
    ...(equivocado ? { separadorEquivocado: equivocado } : {}),
    titulos: cabecera?.valores ?? [],
    filas,
  };
}

/** Título comparable: sin acentos, espacios ni signos, en minúsculas ("Razón social" → "razonsocial"). */
export function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** "Sí", "S", "1", "true", "X" → true; "No", "N", "0", "false", "" → false; otro → undefined. */
export function leerSiNo(valor: string | undefined): boolean | undefined {
  const v = normalizarTitulo(valor ?? "");
  if (["si", "s", "1", "true", "verdadero", "x", "yes"].includes(v)) return true;
  if (["no", "n", "0", "false", "falso", ""].includes(v)) return false;
  return undefined;
}
