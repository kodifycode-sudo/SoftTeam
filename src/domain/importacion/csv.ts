/*
 * Lectura de archivos de importación: texto separado por ";" (o "," o
 * tabulador), con los títulos de las columnas en la primera línea. Sigue las
 * reglas habituales del CSV: un valor entre comillas puede tener el
 * separador o saltos de línea, y "" dentro de comillas es una comilla.
 */

export interface FilaLeida {
  /** Línea del archivo donde empieza la fila (para los mensajes de error). */
  linea: number;
  valores: string[];
}

export interface TablaLeida {
  separador: ";" | "," | "\t";
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

/** El separador más frecuente en la primera línea, fuera de comillas. */
function detectarSeparador(primeraLinea: string): TablaLeida["separador"] {
  const cuenta = { ";": 0, ",": 0, "\t": 0 };
  let entreComillas = false;
  for (const c of primeraLinea) {
    if (c === '"') entreComillas = !entreComillas;
    else if (!entreComillas && c in cuenta) cuenta[c as keyof typeof cuenta]++;
  }
  if (cuenta[";"] >= cuenta[","] && cuenta[";"] >= cuenta["\t"] && cuenta[";"] > 0) return ";";
  if (cuenta["\t"] > cuenta[","]) return "\t";
  return cuenta[","] > 0 ? "," : ";";
}

export function leerTabla(texto: string): TablaLeida {
  const fin = texto.search(/\r?\n/);
  const separador = detectarSeparador(fin < 0 ? texto : texto.slice(0, fin));

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
    } else if (c === separador) {
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
  return { separador, titulos: cabecera?.valores ?? [], filas };
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
