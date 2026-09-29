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
    /** Conexiones por instancia hacia Postgres (con el pooler de Neon alcanza con pocas). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    /**
     * URL pública de la app (enlaces de los mails, retorno de los pagos). En
     * los despliegues de vista previa de Vercel se toma la del despliegue.
     */
    BETTER_AUTH_URL: z.preprocess(
      (v) =>
        v ??
        (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : undefined),
      z.url().default("http://localhost:3000"),
    ),
    /** Envío de mails. Sin clave, en desarrollo los mails se muestran en la consola. */
    RESEND_API_KEY: z.string().optional(),
    EMAIL_REMITENTE: z.string().default("STLic <no-responder@softeam.com.ar>"),
    /** Usuario de Administración SOFTeam que se crea al sembrar datos. */
    ADMIN_EMAIL: z.email().default("admin@softeam.local"),
    ADMIN_PASSWORD: z.string().min(10).default("Softeam.2026!"),
    /**
     * Clave maestra (32 bytes en base64) para cifrar los secretos de los
     * sistemas integrados. Generar con: openssl rand -base64 32
     */
    STLIC_CLAVE_MAESTRA: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, {
        error: "Deben ser 32 bytes en base64",
      })
      .optional(),
    /** Secreto con el que el planificador (cron) invoca los procesos programados. */
    CRON_SECRET: z.string().min(24).optional(),
    /**
     * Mercado Pago (link de pago). Sin credenciales, fuera de producción se usa
     * el simulador de pagos; en producción el link de pago queda deshabilitado.
     */
    MERCADOPAGO_ACCESS_TOKEN: z.string().min(10).optional(),
    /** Clave secreta de las notificaciones (webhooks) de Mercado Pago. */
    MERCADOPAGO_WEBHOOK_SECRET: z.string().min(10).optional(),
    /**
     * Xubio (facturación electrónica). Sin credenciales, fuera de producción
     * se usa el simulador; en producción las órdenes quedan pendientes de
     * facturar hasta configurarlo.
     */
    XUBIO_CLIENT_ID: z.string().min(4).optional(),
    XUBIO_SECRET_ID: z.string().min(4).optional(),
    /** Punto de venta electrónico de Xubio con el que se factura. */
    XUBIO_PUNTO_VENTA_ID: z.coerce.number().int().positive().optional(),
    /** Producto o servicio de Xubio para las líneas de la factura. */
    XUBIO_PRODUCTO_ID: z.coerce.number().int().positive().optional(),
    XUBIO_CENTRO_COSTO_ID: z.coerce.number().int().positive().optional(),
  })
  .superRefine((env, ctx) => {
    const xubio = [
      env.XUBIO_CLIENT_ID,
      env.XUBIO_SECRET_ID,
      env.XUBIO_PUNTO_VENTA_ID,
      env.XUBIO_PRODUCTO_ID,
    ].filter((v) => v !== undefined).length;
    if (xubio > 0 && xubio < 4) {
      ctx.addIssue({
        code: "custom",
        path: ["XUBIO_CLIENT_ID"],
        message:
          "Xubio necesita XUBIO_CLIENT_ID, XUBIO_SECRET_ID, XUBIO_PUNTO_VENTA_ID y XUBIO_PRODUCTO_ID",
      });
    }
    if (Boolean(env.MERCADOPAGO_ACCESS_TOKEN) !== Boolean(env.MERCADOPAGO_WEBHOOK_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["MERCADOPAGO_WEBHOOK_SECRET"],
        message: "Mercado Pago necesita el token y la clave de notificaciones",
      });
    }
    // Durante `next build` el entorno es "production" pero la app no corre:
    // las claves de producción se exigen al ejecutarla, no al compilarla.
    if (env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build")
      return;
    for (const clave of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "RESEND_API_KEY",
      "STLIC_CLAVE_MAESTRA",
      "CRON_SECRET",
    ] as const) {
      if (!env[clave]) {
        ctx.addIssue({ code: "custom", path: [clave], message: "Obligatoria en producción" });
      }
    }
    // Con el valor por defecto (localhost), los mails y los pagos apuntarían mal.
    if (env.BETTER_AUTH_URL.startsWith("http://localhost")) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "Obligatoria en producción: la URL pública de la app",
      });
    }
  });

export const env = esquema.parse(process.env);

export const esProduccion = env.NODE_ENV === "production";

// Solo desarrollo y tests: en producción la clave maestra es obligatoria.
const CLAVE_MAESTRA_DESARROLLO = Buffer.alloc(32, "stlic-desarrollo").toString("base64");
export const claveMaestra = env.STLIC_CLAVE_MAESTRA ?? CLAVE_MAESTRA_DESARROLLO;
export const secretoCron = env.CRON_SECRET ?? "stlic-cron-desarrollo-no-usar-en-produccion";
