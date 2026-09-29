import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV !== "production";

/** Política de contenido: solo recursos propios (más lo que el modo desarrollo necesita). */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // blob: son archivos elegidos en la propia página (vista previa del logo antes
  // de subirlo): el navegador los lee como conexión. No permite salir a terceros.
  "connect-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: true,
  // PGlite carga WebAssembly desde node_modules: no se empaqueta.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    authInterrupts: true,
    // La importación de datos sube archivos de hasta 4 MB (Vercel corta en 4,5 MB).
    serverActions: { bodySizeLimit: "4mb" },
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
