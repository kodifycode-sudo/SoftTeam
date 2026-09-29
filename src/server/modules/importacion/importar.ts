import { decodificar, leerTabla, normalizarTitulo } from "@/domain/importacion/csv";
import type { Db } from "@/server/db/cliente";
import { auditar } from "../auditoria";
import { nombresDeProvincias } from "../catalogo/paises";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import {
  type Contexto,
  DEFINICIONES,
  ErrorFila,
  type Fila,
  type TipoImportacion,
} from "./definiciones";

/**
 * Límites: un archivo de migración grande entra, uno desmedido no traba el
 * servidor. Vercel no acepta pedidos de más de 4,5 MB: un archivo mayor se
 * divide en partes.
 */
export const MAXIMO_BYTES = 4 * 1024 * 1024 - 64 * 1024;
export const MAXIMO_FILAS = 10_000;
const MAXIMO_ERRORES = 200;

export interface ResultadoImportacion {
  tipo: TipoImportacion;
  /** Se guardó (solo si se pidió importar y no hubo ningún error). */
  confirmado: boolean;
  filas: number;
  creados: number;
  actualizados: number;
  existentes: number;
  /** Columnas del archivo reconocidas (título → campo) y las que se ignoran. */
  reconocidas: { titulo: string; campo: string }[];
  ignoradas: string[];
  /** Error que impide leer el archivo (columnas obligatorias que faltan, vacío…). */
  errorGeneral?: string;
  errores: { linea: number; mensaje: string }[];
  erroresOmitidos: number;
  /** Empresas con cambios (para avisar a los productos). */
  empresas: string[];
  /** Administradores con acceso nuevo (para enviarles el mail, si se pidió). */
  invitaciones: Contexto["invitaciones"];
}

/** Para deshacer una revisión o una importación con errores. */
class Deshacer extends Error {}

/**
 * Importa un archivo con formato fijo: los nombres de los campos en la
 * primera línea y los valores en las siguientes, separados por ";". Un
 * archivo con comas o tabuladores se rechaza entero. Todo o nada: revisa cada fila (sin cortar en
 * el primer error) y solo guarda si se pidió `confirmar` y no hubo ninguno.
 */
export async function importar(
  db: Db,
  tipo: TipoImportacion,
  bytes: Uint8Array,
  opciones: { confirmar: boolean },
  actorId: string,
): Promise<ResultadoImportacion> {
  const definicion = DEFINICIONES[tipo];
  const resultado: ResultadoImportacion = {
    tipo,
    confirmado: false,
    filas: 0,
    creados: 0,
    actualizados: 0,
    existentes: 0,
    reconocidas: [],
    ignoradas: [],
    errores: [],
    erroresOmitidos: 0,
    empresas: [],
    invitaciones: [],
  };
  if (bytes.byteLength === 0) return { ...resultado, errorGeneral: "El archivo está vacío." };
  if (bytes.byteLength > MAXIMO_BYTES) {
    return { ...resultado, errorGeneral: "El archivo supera los 4 MB: dividilo en partes." };
  }

  const tabla = leerTabla(decodificar(bytes));
  if (tabla.separadorEquivocado) {
    const cual = tabla.separadorEquivocado === "," ? "comas" : "tabuladores";
    return {
      ...resultado,
      errorGeneral: `Los campos tienen que estar separados por punto y coma (;) y este archivo usa ${cual}. Volvé a exportarlo como se explica en "Cómo preparar el archivo".`,
    };
  }
  resultado.filas = tabla.filas.length;

  // Títulos → campos, por cualquiera de sus nombres (KB o simples).
  const porAlias = new Map<string, string>();
  for (const c of definicion.columnas) {
    for (const alias of c.alias) porAlias.set(normalizarTitulo(alias), c.campo);
  }
  const indices = new Map<string, number>();
  tabla.titulos.forEach((titulo, i) => {
    const campo = porAlias.get(normalizarTitulo(titulo));
    if (campo && !indices.has(campo)) {
      indices.set(campo, i);
      resultado.reconocidas.push({ titulo, campo });
    } else if (titulo) {
      resultado.ignoradas.push(titulo);
    }
  });
  const faltantes = definicion.columnas.filter((c) => c.requerida && !indices.has(c.campo));
  if (faltantes.length > 0) {
    return {
      ...resultado,
      errorGeneral: `Faltan columnas obligatorias: ${faltantes.map((c) => c.titulo).join(", ")}.`,
    };
  }
  if (tabla.filas.length === 0) return { ...resultado, errorGeneral: "El archivo no tiene filas." };
  if (tabla.filas.length > MAXIMO_FILAS) {
    return {
      ...resultado,
      errorGeneral: `El archivo tiene ${tabla.filas.length} filas: el máximo es ${MAXIMO_FILAS}.`,
    };
  }

  const contexto: Contexto = {
    paisId: "AR",
    provincias: await nombresDeProvincias(db, "AR"),
    invitaciones: [],
    empresasTocadas: new Set(),
  };
  const registrarError = (linea: number, mensaje: string) => {
    if (resultado.errores.length < MAXIMO_ERRORES) resultado.errores.push({ linea, mensaje });
    else resultado.erroresOmitidos++;
  };

  try {
    await db.transaction(async (tx) => {
      for (const { linea, valores } of tabla.filas) {
        const fila: Fila = {};
        for (const [campo, i] of indices) fila[campo] = valores[i] ?? "";
        try {
          // Punto de guardado por fila: un error la descarta sin cortar la revisión.
          const r = await tx.transaction((sp) => definicion.procesar(sp, fila, contexto));
          if (r === "creado") resultado.creados++;
          else if (r === "actualizado") resultado.actualizados++;
          else resultado.existentes++;
        } catch (error) {
          if (error instanceof ErrorFila) registrarError(linea, error.message);
          else {
            registrarError(
              linea,
              `No se pudo procesar la fila: ${error instanceof Error ? error.message.slice(0, 200) : "error inesperado"}.`,
            );
          }
        }
      }
      if (!opciones.confirmar || resultado.errores.length > 0) throw new Deshacer();

      const empresas = [...contexto.empresasTocadas];
      await registrarCambioEmpresa(tx, empresas);
      await auditar(tx, {
        actorId,
        entidad: "importacion",
        entidadId: tipo,
        accion: "importacion",
        despues: {
          tipo,
          filas: resultado.filas,
          creados: resultado.creados,
          actualizados: resultado.actualizados,
          existentes: resultado.existentes,
        },
      });
      resultado.confirmado = true;
      resultado.empresas = empresas;
      resultado.invitaciones = contexto.invitaciones;
    });
  } catch (error) {
    if (!(error instanceof Deshacer)) throw error;
  }
  return resultado;
}
