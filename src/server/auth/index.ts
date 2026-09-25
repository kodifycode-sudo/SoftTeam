import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { env } from "@/env";
import { type Db, obtenerDb } from "@/server/db";
import {
  cuentasAuth,
  limitesIntentos,
  sesiones,
  usuarios,
  verificaciones,
} from "@/server/db/schema";
import { enviarMail } from "@/server/email/enviar";

const ASUNTOS = {
  "email-verification": "Tu código para activar la cuenta",
  "sign-in": "Tu código para ingresar",
  "forget-password": "Tu código para cambiar la contraseña",
  "change-email": "Tu código para confirmar el nuevo mail",
} as const;

// Solo para desarrollo: en producción `env` exige BETTER_AUTH_SECRET.
const SECRETO_DESARROLLO = "stlic-desarrollo-no-usar-en-produccion-0123456789";

function crearAuth(db: Db) {
  return betterAuth({
    appName: "STLic",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET ?? SECRETO_DESARROLLO,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: usuarios,
        session: sesiones,
        account: cuentasAuth,
        verification: verificaciones,
        rateLimit: limitesIntentos,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    emailVerification: { autoSignInAfterVerification: true },
    user: {
      additionalFields: {
        // `input: false`: nadie puede asignarse un rol desde el alta.
        rolSofteam: { type: "string", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/email-otp/verify-email": { window: 60, max: 10 },
      },
    },
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          await enviarMail({
            para: email,
            asunto: ASUNTOS[type],
            parrafos: [
              "Hola,",
              "Usá este código en STLic. Vence en 10 minutos y sirve una sola vez.",
            ],
            codigo: otp,
          });
        },
      }),
      // Debe ir último: aplica las cookies de sesión en Server Actions.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof crearAuth>;
export type Sesion = Auth["$Infer"]["Session"];

const global = globalThis as unknown as { __stlicAuth?: Promise<Auth> };

/** Instancia única de Better Auth (depende de la conexión, que se inicializa de forma asíncrona). */
export function obtenerAuth(): Promise<Auth> {
  global.__stlicAuth ??= obtenerDb().then(crearAuth);
  return global.__stlicAuth;
}
