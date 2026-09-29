import {
  type AdjuntoValidado,
  type ErrorAdjunto,
  TAMANO_MAXIMO_ADJUNTO,
  validarAdjuntos,
} from "@/domain/soporte/adjuntos";

const MB = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("es-AR")} MB`;

function mensaje(error: ErrorAdjunto, nombre?: string): string {
  const cual = nombre ? `"${nombre}"` : "El archivo";
  switch (error) {
    case "DEMASIADOS":
      return "Podés adjuntar hasta 3 archivos por mensaje.";
    case "DEMASIADO_GRANDE":
      return nombre
        ? `${cual} supera los ${MB(TAMANO_MAXIMO_ADJUNTO)}.`
        : "Entre todos los archivos superan los 3,5 MB: mandá algunos en otro mensaje.";
    case "FORMATO_INVALIDO":
      return `${cual} no es una imagen (PNG, JPG, WebP) ni un PDF.`;
  }
}

/** Lee y valida los archivos del campo "adjuntos" de un formulario. */
export async function adjuntosDelFormulario(
  formData: FormData,
): Promise<{ ok: true; adjuntos: AdjuntoValidado[] } | { ok: false; mensaje: string }> {
  const archivos = await Promise.all(
    formData
      .getAll("adjuntos")
      .filter((v): v is File => typeof v !== "string")
      .map(async (f) => ({ nombre: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  const r = validarAdjuntos(archivos);
  return r.ok ? r : { ok: false, mensaje: mensaje(r.error, r.nombre) };
}
