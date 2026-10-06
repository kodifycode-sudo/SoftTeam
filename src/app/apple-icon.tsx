import { ImageResponse } from "next/og";
import { fuentesMarca, InsigniaSt } from "@/lib/imagenes-marca";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícono para la pantalla de inicio de iOS: cuadrado lleno, el sistema redondea las esquinas. */
export default async function IconoApple() {
  return new ImageResponse(<InsigniaSt lado={size.width} redondeo={0} />, {
    ...size,
    fonts: await fuentesMarca(),
  });
}
