"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  type EstadoFormulario,
  erroresPorCampo,
  rutaInternaSegura,
  valoresDe,
} from "@/lib/formulario";
import { envioFallido, obtenerAuth } from "@/server/auth";
import { codigoDeError, esErrorDeAuth, esLimiteDeIntentos } from "@/server/auth/errores";
import { intentoPermitido } from "@/server/auth/limites";
import { obtenerDb } from "@/server/db";
import { usuarios } from "@/server/db/schema";
import { condicionIvaValida } from "@/server/modules/catalogo/condiciones-iva";
import { provinciaValida } from "@/server/modules/catalogo/paises";
import {
  confirmarAlta,
  esquemaContrasena,
  esquemaDatosAlta,
  existeClienteConCuit,
  guardarSolicitudAlta,
} from "@/server/modules/cuentas/alta";
import { vincularColaboradores } from "@/server/modules/cuentas/usuarios";

/**
 * Pantalla para confirmar el mail. `fallo`: el código no se pudo enviar;
 * `pendiente`: ya había un registro sin confirmar con ese mail.
 */
const rutaVerificar = (email: string, aviso: { fallo?: boolean; pendiente?: boolean } = {}) =>
  `/registro/verificar?email=${encodeURIComponent(email)}${aviso.fallo ? "&envio=fallo" : ""}${
    aviso.pendiente ? "&aviso=pendiente" : ""
  }`;

const NO_ENVIADO = "No pudimos enviarte el mail con el código. Probá de nuevo en unos minutos.";

// ─── Ingresar ──────────────────────────────────────────────────────────────

const esquemaIngreso = z.object({
  email: z.email({ error: "Ingresá tu mail" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Ingresá tu contraseña" }),
});

export async function ingresar(_: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = valoresDe(formData);
  const recordar = { email: valores.email ?? "" };
  const datos = esquemaIngreso.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores: recordar };
  if (!(await intentoPermitido("ingresar", datos.data.email))) {
    return {
      mensaje: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
      valores: recordar,
    };
  }

  const auth = await obtenerAuth();
  let esSofteam = false;
  let pideSegundoFactor = false;
  try {
    const resultado = await auth.api.signInEmail({ body: datos.data, headers: await headers() });
    // Con 2FA activo todavía no hay sesión: falta el código de la app.
    if ("twoFactorRedirect" in resultado && resultado.twoFactorRedirect) {
      pideSegundoFactor = true;
    } else {
      esSofteam = Boolean(resultado.user.rolSofteam);
      // Accesos que le dieron antes de tener usuario (invitaciones).
      if (!esSofteam) {
        await vincularColaboradores(await obtenerDb(), resultado.user.id, resultado.user.email);
      }
    }
  } catch (error) {
    if (codigoDeError(error) === "EMAIL_NOT_VERIFIED") {
      // Si ya se mandaron varios códigos, se usa el último que llegó.
      if (await intentoPermitido("enviarCodigo", datos.data.email)) {
        await auth.api.sendVerificationOTP({
          body: { email: datos.data.email, type: "email-verification" },
        });
      }
      redirect(rutaVerificar(datos.data.email, { fallo: envioFallido(datos.data.email) }));
    }
    if (esLimiteDeIntentos(error)) {
      return {
        mensaje: "Demasiados intentos. Esperá un minuto y volvé a probar.",
        valores: recordar,
      };
    }
    if (esErrorDeAuth(error)) {
      // Mismo mensaje exista o no el mail: no se revela quién tiene cuenta.
      return { mensaje: "El mail o la contraseña no son correctos.", valores: recordar };
    }
    throw error;
  }
  if (pideSegundoFactor) {
    const destino = rutaInternaSegura(valores.destino, "");
    redirect(`/ingresar/codigo${destino ? `?destino=${encodeURIComponent(destino)}` : ""}`);
  }
  redirect(rutaInternaSegura(valores.destino, esSofteam ? "/admin" : "/portal"));
}

// ─── Segundo factor ────────────────────────────────────────────────────────

const esquemaSegundoFactor = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("app"),
    codigo: z.string().regex(/^\d{6}$/, { error: "Ingresá los 6 números de la app" }),
  }),
  z.object({
    tipo: z.literal("respaldo"),
    codigo: z.string().trim().min(8, { error: "Ingresá uno de tus códigos de respaldo" }).max(20),
  }),
]);

/**
 * Completa un ingreso con 2FA: valida el código de la app (o uno de
 * respaldo) contra la cookie temporal que dejó el ingreso y recién ahí crea
 * la sesión. "Confiar en este dispositivo" evita pedirlo 30 días en este
 * navegador.
 */
export async function verificarSegundoFactor(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = valoresDe(formData);
  const datos = esquemaSegundoFactor.safeParse(valores);
  if (!datos.success) return { errores: erroresPorCampo(datos.error) };
  if (!(await intentoPermitido("segundoFactor")))
    return { mensaje: "Demasiados intentos. Esperá unos minutos y volvé a probar." };

  const auth = await obtenerAuth();
  const body = { code: datos.data.codigo, trustDevice: valores.confiar === "on" };
  let esSofteam = false;
  try {
    const resultado =
      datos.data.tipo === "app"
        ? await auth.api.verifyTOTP({ body, headers: await headers() })
        : await auth.api.verifyBackupCode({ body, headers: await headers() });
    esSofteam = Boolean((resultado.user as { rolSofteam?: string | null }).rolSofteam);
    if (!esSofteam) {
      await vincularColaboradores(await obtenerDb(), resultado.user.id, resultado.user.email);
    }
  } catch (error) {
    const codigo = codigoDeError(error);
    if (codigo === "INVALID_TWO_FACTOR_COOKIE") {
      // Pasaron más de 10 minutos desde la contraseña: se vuelve a empezar.
      redirect("/ingresar?aviso=codigo-vencido");
    }
    if (codigo === "ACCOUNT_TEMPORARILY_LOCKED" || esLimiteDeIntentos(error)) {
      return {
        mensaje: "Demasiados códigos incorrectos. Esperá unos minutos y volvé a probar.",
      };
    }
    if (esErrorDeAuth(error)) {
      return {
        errores: {
          codigo: [
            datos.data.tipo === "app"
              ? "El código no es correcto. Fijate que la hora del celular esté bien."
              : "Ese código de respaldo no es válido o ya se usó.",
          ],
        },
      };
    }
    throw error;
  }
  redirect(rutaInternaSegura(valores.destino, esSofteam ? "/admin" : "/portal"));
}

// ─── Alta en línea ─────────────────────────────────────────────────────────

const esquemaRegistro = esquemaDatosAlta.and(
  z
    .object({
      password: esquemaContrasena,
      confirmacion: z.string(),
      aceptaTerminos: z.literal(true, { error: "Tenés que aceptar las condiciones" }),
    })
    .refine((d) => d.password === d.confirmacion, {
      path: ["confirmacion"],
      error: "Las contraseñas no coinciden",
    }),
);

export async function registrarse(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = valoresDe(formData);
  const { password: _p, confirmacion: _c, ...recordar } = valores;
  const datos = esquemaRegistro.safeParse({
    ...valores,
    razonSocial: valores.razonSocial || undefined,
    tipoSociedad: valores.tipoSociedad || undefined,
    aceptaNotificaciones: valores.aceptaNotificaciones === "on",
    aceptaTerminos: valores.aceptaTerminos === "on",
  });
  if (!datos.success) {
    return {
      errores: erroresPorCampo(datos.error),
      mensaje: "Revisá los datos marcados.",
      valores: recordar,
    };
  }
  if (!(await intentoPermitido("registrarse")))
    return {
      mensaje: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
      valores: recordar,
    };
  const { password, confirmacion: _confirmacion, aceptaTerminos: _acepta, ...alta } = datos.data;

  const db = await obtenerDb();
  if (!(await provinciaValida(db, "AR", alta.provincia))) {
    return { errores: { provincia: ["Elegí la provincia de la lista."] }, valores: recordar };
  }
  if (!(await condicionIvaValida(db, "AR", alta.condicionIva))) {
    return {
      errores: { condicionIva: ["Elegí una condición frente al IVA de la lista."] },
      valores: recordar,
    };
  }
  if (await existeClienteConCuit(db, alta.cuit)) {
    return {
      errores: {
        cuit: ["Ya existe una cuenta con este CUIT. Pedile acceso al administrador de tu empresa."],
      },
      valores: recordar,
    };
  }

  const auth = await obtenerAuth();
  // El mail ya registrado se resuelve antes: con un mail existente, la
  // librería de autenticación no avisa (para no revelar quién tiene cuenta).
  const existente = await db.query.usuarios.findFirst({
    columns: { id: true, emailVerified: true },
    where: eq(usuarios.email, alta.email),
  });
  if (existente?.emailVerified) {
    return {
      errores: {
        email: [
          "Ya hay una cuenta con este mail. Ingresá con tu contraseña o recuperala desde el ingreso.",
        ],
      },
      valores: recordar,
    };
  }
  if (existente) {
    // Un registro anterior sin confirmar (se cortó la conexión, no llegó el
    // mail…): se actualiza con este intento y se manda un código nuevo. Solo
    // quien recibe el código en esa casilla puede activar la cuenta.
    const contexto = await auth.$context;
    await contexto.internalAdapter.updatePassword(
      existente.id,
      await contexto.password.hash(password),
    );
    await db.update(usuarios).set({ name: alta.nombre }).where(eq(usuarios.id, existente.id));
    await guardarSolicitudAlta(db, existente.id, esquemaDatosAlta.parse(alta));
    if (await intentoPermitido("enviarCodigo", alta.email)) {
      await auth.api.sendVerificationOTP({
        body: { email: alta.email, type: "email-verification" },
      });
    }
    redirect(rutaVerificar(alta.email, { pendiente: true, fallo: envioFallido(alta.email) }));
  }

  try {
    const { user } = await auth.api.signUpEmail({
      body: { name: alta.nombre, email: alta.email, password },
      headers: await headers(),
    });
    await guardarSolicitudAlta(db, user.id, esquemaDatosAlta.parse(alta));
  } catch (error) {
    if (esLimiteDeIntentos(error)) {
      return {
        mensaje: "Demasiados intentos. Esperá un minuto y volvé a probar.",
        valores: recordar,
      };
    }
    throw error;
  }
  redirect(rutaVerificar(alta.email, { fallo: envioFallido(alta.email) }));
}

// ─── Verificación del mail ─────────────────────────────────────────────────

const MENSAJES_OTP: Record<string, string> = {
  INVALID_OTP: "El código no es correcto.",
  OTP_EXPIRED: "El código venció. Pedí uno nuevo.",
  TOO_MANY_ATTEMPTS: "Superaste los intentos permitidos. Pedí un código nuevo.",
};

export async function verificarCodigo(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const datos = z
    .object({
      email: z.email().trim().toLowerCase(),
      codigo: z.string().regex(/^\d{6}$/, { error: "El código tiene 6 números" }),
    })
    .safeParse(valoresDe(formData));
  if (!datos.success) return { errores: erroresPorCampo(datos.error) };
  if (!(await intentoPermitido("verificarCodigo")))
    return { mensaje: "Demasiados intentos. Esperá unos minutos y volvé a probar." };

  const auth = await obtenerAuth();
  let usuarioId: string;
  let esSofteam = false;
  try {
    const resultado = await auth.api.verifyEmailOTP({
      body: { email: datos.data.email, otp: datos.data.codigo },
      headers: await headers(),
    });
    usuarioId = resultado.user.id;
    esSofteam = Boolean((resultado.user as { rolSofteam?: string | null }).rolSofteam);
  } catch (error) {
    const codigo = codigoDeError(error);
    if (codigo && MENSAJES_OTP[codigo]) return { errores: { codigo: [MENSAJES_OTP[codigo]] } };
    if (esLimiteDeIntentos(error)) return { mensaje: "Demasiados intentos. Esperá un minuto." };
    throw error;
  }

  if (esSofteam) redirect("/admin");
  const db = await obtenerDb();
  const solicitud = await db.query.solicitudesAlta.findFirst({
    where: (s, { eq }) => eq(s.usuarioId, usuarioId),
  });
  if (solicitud) await confirmarAlta(db, usuarioId);
  redirect("/portal?bienvenida=1");
}

export async function reenviarCodigo(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { mensaje: "Falta el mail." };
  if (!(await intentoPermitido("enviarCodigo", email.data))) {
    return { mensaje: "Ya te mandamos varios códigos. Esperá unos minutos antes de pedir otro." };
  }
  try {
    const auth = await obtenerAuth();
    await auth.api.sendVerificationOTP({ body: { email: email.data, type: "email-verification" } });
  } catch (error) {
    if (esLimiteDeIntentos(error))
      return { mensaje: "Esperá un minuto antes de pedir otro código." };
    throw error;
  }
  if (envioFallido(email.data)) return { mensaje: NO_ENVIADO };
  return { ok: true, mensaje: "Te enviamos un código nuevo." };
}

// ─── Recuperar la contraseña (y activar una invitación) ─────────────────────

const rutaCambiar = (email: string, invitacion: boolean) =>
  `/recuperar/cambiar?email=${encodeURIComponent(email)}${invitacion ? "&invitacion=1" : ""}`;

/**
 * Envía un código para elegir una contraseña nueva. Responde igual exista o
 * no el mail, para no revelar quién tiene cuenta.
 */
export async function pedirCodigoContrasena(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = valoresDe(formData);
  const email = z.email({ error: "Ingresá tu mail" }).trim().toLowerCase().safeParse(valores.email);
  if (!email.success) return { errores: { email: ["Ingresá tu mail"] }, valores };
  if (!(await intentoPermitido("enviarCodigo", email.data))) {
    return {
      mensaje: "Ya te mandamos varios códigos. Esperá unos minutos antes de pedir otro.",
      valores,
    };
  }
  try {
    const auth = await obtenerAuth();
    await auth.api.requestPasswordResetEmailOTP({ body: { email: email.data } });
  } catch (error) {
    if (esLimiteDeIntentos(error)) {
      return { mensaje: "Esperá un minuto antes de pedir otro código.", valores };
    }
    throw error;
  }
  if (envioFallido(email.data)) return { mensaje: NO_ENVIADO, valores };
  redirect(rutaCambiar(email.data, valores.invitacion === "1"));
}

const esquemaCambio = z
  .object({
    email: z.email().trim().toLowerCase(),
    codigo: z.string().regex(/^\d{6}$/, { error: "El código tiene 6 números" }),
    password: esquemaContrasena,
    confirmacion: z.string(),
  })
  .refine((d) => d.password === d.confirmacion, {
    path: ["confirmacion"],
    error: "Las contraseñas no coinciden",
  });

export async function cambiarContrasena(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const datos = esquemaCambio.safeParse(valoresDe(formData));
  if (!datos.success) return { errores: erroresPorCampo(datos.error) };
  if (!(await intentoPermitido("verificarCodigo")))
    return { mensaje: "Demasiados intentos. Esperá unos minutos y volvé a probar." };
  const auth = await obtenerAuth();
  try {
    await auth.api.resetPasswordEmailOTP({
      body: { email: datos.data.email, otp: datos.data.codigo, password: datos.data.password },
    });
  } catch (error) {
    const codigo = codigoDeError(error);
    if (codigo && MENSAJES_OTP[codigo]) return { errores: { codigo: [MENSAJES_OTP[codigo]] } };
    if (esLimiteDeIntentos(error)) return { mensaje: "Demasiados intentos. Esperá un minuto." };
    if (esErrorDeAuth(error)) return { errores: { codigo: ["El código no es correcto."] } };
    throw error;
  }
  redirect(`/ingresar?aviso=contrasena&email=${encodeURIComponent(datos.data.email)}`);
}

// ─── Salir ─────────────────────────────────────────────────────────────────

export async function salir(): Promise<void> {
  const auth = await obtenerAuth();
  await auth.api.signOut({ headers: await headers() });
  redirect("/ingresar");
}
