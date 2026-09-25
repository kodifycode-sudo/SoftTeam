import "server-only";
import { z } from "zod";

/**
 * Variables de entorno validadas al arrancar. Si falta algo obligatorio, la app
 * no arranca con un error claro, en vez de fallar a mitad de una operación.
 */
const esquema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Postgres (Neon). Sin valor, en desarrollo se usa PGlite en `.data/pglite`. */
    DATABASE_URL: z.url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    /** Envío de mails. Sin clave, en desarrollo los mails se muestran en la consola. */
    RESEND_API_KEY: z.string().optional(),
    EMAIL_REMITENTE: z.string().default("STLic <no-responder@softeam.com.ar>"),
    /** Usuario de Administración SOFTeam que se crea al sembrar datos. */
    ADMIN_EMAIL: z.email().default("admin@softeam.local"),
    ADMIN_PASSWORD: z.string().min(10).default("Softeam.2026!"),
  })
  .superRefine((env, ctx) => {
    // Durante `next build` el entorno es "production" pero la app no corre:
    // las claves de producción se exigen al ejecutarla, no al compilarla.
    if (env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build")
      return;
    for (const clave of ["DATABASE_URL", "BETTER_AUTH_SECRET", "RESEND_API_KEY"] as const) {
      if (!env[clave]) {
        ctx.addIssue({ code: "custom", path: [clave], message: "Obligatoria en producción" });
      }
    }
  });

export const env = esquema.parse(process.env);

export const esProduccion = env.NODE_ENV === "production";
