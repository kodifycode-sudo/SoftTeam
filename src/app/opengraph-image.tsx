import { ImageResponse } from "next/og";
import { COLORES_MARCA, fuentesMarca, InsigniaSt } from "@/lib/imagenes-marca";

export const alt = "STLic · Portal de clientes de SOFTeam Sistemas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PRODUCTOS = ["Prodigal", "CotiWeb", "BienSeguro", "Boletín C@"];
const TITULO = [
  ...["Administrá", "las", "licencias", "de", "tu", "broker"].map((palabra) => ({
    palabra,
    resaltada: false,
  })),
  ...["sin", "llamar", "a", "nadie."].map((palabra) => ({ palabra, resaltada: true })),
];

/** Imagen que se ve al compartir el enlace (WhatsApp, mail, redes). */
export default async function ImagenCompartir() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        fontFamily: "Geist",
        color: COLORES_MARCA.texto,
        backgroundColor: COLORES_MARCA.marino,
        // Brillos de marca (como en la portada) sobre una cuadrícula sutil.
        backgroundImage: [
          `radial-gradient(circle at 92% 0%, ${COLORES_MARCA.amarillo}40, transparent 45%)`,
          `radial-gradient(circle at 0% 100%, ${COLORES_MARCA.azul}55, transparent 50%)`,
          "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)",
          "linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: "100% 100%, 100% 100%, 44px 44px, 44px 44px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <InsigniaSt lado={72} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>
            SOFTeam
            <span style={{ color: COLORES_MARCA.amarillo, margin: "0 10px" }}>·</span>
            STLic
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3, opacity: 0.6 }}>
            LICENCIAS Y CUENTAS
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: -2,
            maxWidth: 960,
          }}
        >
          {/* Palabra por palabra: `ImageResponse` no fluye texto entre elementos en línea. */}
          {TITULO.map(({ palabra, resaltada }, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: texto fijo.
              key={i}
              style={{ marginRight: 18, color: resaltada ? COLORES_MARCA.amarillo : undefined }}
            >
              {palabra}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 28, opacity: 0.7 }}>
          Contratá, renová y seguí el uso de tus productos desde un solo lugar.
        </div>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        {PRODUCTOS.map((producto) => (
          <div
            key={producto}
            style={{
              display: "flex",
              padding: "10px 22px",
              fontSize: 22,
              fontWeight: 700,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            {producto}
          </div>
        ))}
      </div>
    </div>,
    { ...size, fonts: await fuentesMarca() },
  );
}
