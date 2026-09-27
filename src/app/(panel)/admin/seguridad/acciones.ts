"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/formulario";
import { obtenerAuth } from "@/server/auth";
import { codigoDeError, esErrorDeAuth, esLimiteDeIntentos } from "@/server/auth/errores";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { auditarDosFactores } from "@/server/modules/cuentas/dos-factores";

/** Estado de la activación: el QR, el secreto (para cargarlo a mano) y los códigos de respaldo. */
export interface EstadoDosFactores extends EstadoFormulario {
  qr?: string;
  secreto?: string;
  codigos?: string[];
}

const contrasena = z.string().min(1, { error: "Ingresá tu contraseña" });

/** Traduce los errores de Better Auth de estas acciones. */
function rechazo(error: unknown, campo: "password" | "codigo"): EstadoDosFactores {
  const codigo = codigoDeError(error);
  if (esLimiteDeIntentos(error) || codigo === "ACCOUNT_TEMPORARILY_LOCKED") {
    return { mensaje: "Demasiados intentos. Esperá unos minutos y volvé a probar." };
  }
  if (codigo === "INVALID_PASSWORD") {
    return { errores: { password: ["La contraseña no es correcta."] } };
  }
  if (esErrorDeAuth(error) && campo === "codigo") {
    return {
      errores: { codigo: ["El código no es correcto. Fijate que la hora del celular esté bien."] },
    };
  }
  if (esErrorDeAuth(error)) return { mensaje: "No se pudo completar. Volvé a intentar." };
  throw error;
}

/**
 * Paso 1: con la contraseña, genera el secreto y los códigos de respaldo.
 * Todavía no queda activo: recién al confirmar el primer código de la app.
 */
export async function iniciarActivacionAccion(
  _: EstadoDosFactores,
  formData: FormData,
): Promise<EstadoDosFactores> {
  await requerirSofteam();
  const password = contrasena.safeParse(formData.get("password"));
  if (!password.success) return { errores: { password: ["Ingresá tu contraseña"] } };
  try {
    const auth = await obtenerAuth();
    const resultado = await auth.api.enableTwoFactor({
      body: { password: password.data },
      headers: await headers(),
    });
    if (!("totpURI" in resultado)) return { mensaje: "No se pudo generar el código QR." };
    return {
      ok: true,
      qr: await QRCode.toDataURL(resultado.totpURI, { margin: 1, width: 224 }),
      secreto: new URL(resultado.totpURI).searchParams.get("secret") ?? "",
      codigos: resultado.backupCodes,
    };
  } catch (error) {
    return rechazo(error, "password");
  }
}

/** Paso 2: el primer código de la app confirma que quedó bien cargada y activa el 2FA. */
export async function confirmarActivacionAccion(
  _: EstadoDosFactores,
  formData: FormData,
): Promise<EstadoDosFactores> {
  const { user } = await requerirSofteam();
  const codigo = z
    .string()
    .regex(/^\d{6}$/)
    .safeParse(formData.get("codigo"));
  if (!codigo.success) return { errores: { codigo: ["Ingresá los 6 números de la app"] } };
  try {
    const auth = await obtenerAuth();
    await auth.api.verifyTOTP({ body: { code: codigo.data }, headers: await headers() });
  } catch (error) {
    return rechazo(error, "codigo");
  }
  await auditarDosFactores(await obtenerDb(), user.id, "2fa_activado");
  revalidatePath("/admin", "layout");
  return { ok: true, mensaje: "Listo: la verificación en dos pasos está activa." };
}

export async function desactivarAccion(
  _: EstadoDosFactores,
  formData: FormData,
): Promise<EstadoDosFactores> {
  const { user } = await requerirSofteam();
  const password = contrasena.safeParse(formData.get("password"));
  if (!password.success) return { errores: { password: ["Ingresá tu contraseña"] } };
  try {
    const auth = await obtenerAuth();
    await auth.api.disableTwoFactor({
      body: { password: password.data },
      headers: await headers(),
    });
  } catch (error) {
    return rechazo(error, "password");
  }
  await auditarDosFactores(await obtenerDb(), user.id, "2fa_desactivado");
  revalidatePath("/admin", "layout");
  return { ok: true, mensaje: "Desactivaste la verificación en dos pasos." };
}

/** Genera códigos de respaldo nuevos: los anteriores dejan de servir. */
export async function regenerarCodigosAccion(
  _: EstadoDosFactores,
  formData: FormData,
): Promise<EstadoDosFactores> {
  const { user } = await requerirSofteam();
  const password = contrasena.safeParse(formData.get("password"));
  if (!password.success) return { errores: { password: ["Ingresá tu contraseña"] } };
  try {
    const auth = await obtenerAuth();
    const resultado = await auth.api.generateBackupCodes({
      body: { password: password.data },
      headers: await headers(),
    });
    await auditarDosFactores(await obtenerDb(), user.id, "2fa_codigos");
    return { ok: true, codigos: resultado.backupCodes };
  } catch (error) {
    return rechazo(error, "password");
  }
}
