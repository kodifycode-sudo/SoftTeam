import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * Piezas para las imágenes que genera Next (ícono, ícono de Apple, imagen
 * para compartir). Se dibujan con `ImageResponse`, que solo entiende estilos
 * en línea y colores literales: estos son los de la marca en globals.css.
 */

export const COLORES_MARCA = {
  amarillo: "#fbc02d",
  marino: "#0f1b2d",
  azul: "#046bd2",
  texto: "#f1f5f9",
} as const;

const PESOS = [400, 700, 900] as const;

/** Geist en los pesos que usan las imágenes (la de `next/og` trae solo el regular). */
export async function fuentesMarca() {
  return Promise.all(
    PESOS.map(async (peso) => ({
      name: "Geist",
      data: await readFile(join(process.cwd(), "assets/fuentes", `geist-${peso}.woff`)),
      weight: peso,
      style: "normal" as const,
    })),
  );
}

/** Insignia "ST" amarilla, igual a la de `MarcaStlic`. `redondeo` en proporción del lado. */
export function InsigniaSt({ lado, redondeo = 0.22 }: { lado: number; redondeo?: number }) {
  return (
    <div
      style={{
        width: lado,
        height: lado,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLORES_MARCA.amarillo,
        borderRadius: lado * redondeo,
        color: COLORES_MARCA.marino,
        fontFamily: "Geist",
        fontWeight: 900,
        fontSize: lado * 0.5,
        letterSpacing: -lado * 0.02,
      }}
    >
      ST
    </div>
  );
}
