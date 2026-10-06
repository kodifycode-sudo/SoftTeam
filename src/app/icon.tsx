import { ImageResponse } from "next/og";
import { fuentesMarca, InsigniaSt } from "@/lib/imagenes-marca";

/** Ícono de la pestaña y de accesos directos, en los tamaños habituales. */
export function generateImageMetadata() {
  return [32, 192, 512].map((lado) => ({
    id: String(lado),
    size: { width: lado, height: lado },
    contentType: "image/png",
  }));
}

export default async function Icono({ id }: { id: Promise<string> }) {
  const lado = Number(await id);
  return new ImageResponse(<InsigniaSt lado={lado} />, {
    width: lado,
    height: lado,
    fonts: await fuentesMarca(),
  });
}
