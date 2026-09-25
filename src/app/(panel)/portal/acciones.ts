"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EMPRESA, requerirCliente } from "@/server/auth/sesion";

/** Cambia la empresa activa (solo entre las que el usuario administra). */
export async function elegirEmpresa(formData: FormData): Promise<void> {
  const contexto = await requerirCliente();
  const empresaId = String(formData.get("empresaId") ?? "");
  if (!contexto.empresas.some((e) => e.id === empresaId)) return;
  (await cookies()).set(COOKIE_EMPRESA, empresaId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect("/portal");
}
