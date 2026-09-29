import "server-only";

/**
 * Respuesta con un adjunto. Las imágenes se muestran; el PDF se descarga.
 * `nosniff` y la política de contenido evitan que el navegador interprete el
 * archivo como otra cosa.
 */
export function respuestaAdjunto(adjunto: { nombre: string; tipo: string; contenido: Buffer }) {
  const disposicion = adjunto.tipo.startsWith("image/") ? "inline" : "attachment";
  return new Response(new Uint8Array(adjunto.contenido), {
    headers: {
      "content-type": adjunto.tipo,
      "content-disposition": `${disposicion}; filename*=UTF-8''${encodeURIComponent(adjunto.nombre)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; sandbox",
      "cache-control": "private, max-age=3600",
    },
  });
}
