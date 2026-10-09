"use server";

import { revalidatePath } from "next/cache";
import { type EstadoFormulario, erroresPorCampo, valoresDe } from "@/lib/formulario";
import { requerirSofteam } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import {
  type ErrorCondicionIva,
  esquemaCondicionIva,
  guardarCondicionIva,
} from "@/server/modules/catalogo/condiciones-iva";
import {
  type ErrorMoneda,
  type ErrorPais,
  type ErrorProvincia,
  esquemaMoneda,
  esquemaPais,
  esquemaProvincia,
  guardarMoneda,
  guardarPais,
  guardarProvincia,
} from "@/server/modules/catalogo/paises";

const MENSAJES_MONEDA: Record<ErrorMoneda, EstadoFormulario> = {
  MONEDA_BASE: { mensaje: "El peso argentino es la moneda base: no se puede desactivar." },
  EN_USO: { mensaje: "La usa un país activo: cambiale la moneda o desactivalo primero." },
};

const MENSAJES_PAIS: Record<ErrorPais, EstadoFormulario> = {
  MONEDA_INVALIDA: { errores: { moneda: ["Elegí una moneda activa."] } },
  ULTIMO_ACTIVO: { mensaje: "Tiene que quedar al menos un país activo." },
};

const MENSAJES_PROVINCIA: Record<ErrorProvincia, EstadoFormulario> = {
  NO_EXISTE: { mensaje: "La provincia ya no existe." },
  PAIS_INEXISTENTE: { mensaje: "El país no existe." },
  REPETIDA: { mensaje: "Ya hay una provincia con ese código o nombre en el país." },
};

const MENSAJES_CONDICION: Record<ErrorCondicionIva, EstadoFormulario> = {
  NO_EXISTE: { mensaje: "La condición ya no existe." },
  PAIS_INEXISTENTE: { mensaje: "El país no existe." },
  REPETIDA: { errores: { nombre: ["Ya hay una condición con ese nombre en el país."] } },
  EN_USO: {
    mensaje:
      "Hay clientes con esta condición: cambiales la condición antes de darla de baja (sin una condición activa no se les puede facturar).",
  },
};

/** Alta o edición de una moneda (solo Administración). */
export async function guardarMonedaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaMoneda.safeParse({
    ...valores,
    cotizacion: valores.cotizacion ?? "",
    activa: valores.activa === "on",
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const r = await guardarMoneda(await obtenerDb(), datos.data, user.id);
  if (!r.ok) return { ...MENSAJES_MONEDA[r.error], valores };
  revalidatePath("/admin/paises");
  return { ok: true, mensaje: `Guardamos la moneda ${datos.data.codigo}.` };
}

/** Alta o edición de un país (solo Administración). */
export async function guardarPaisAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaPais.safeParse({
    ...valores,
    nombreCorto: valores.nombreCorto ?? "",
    activo: valores.activo === "on",
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const r = await guardarPais(await obtenerDb(), datos.data, user.id);
  if (!r.ok) return { ...MENSAJES_PAIS[r.error], valores };
  revalidatePath("/admin/paises");
  return { ok: true, mensaje: `Guardamos ${datos.data.nombre}.` };
}

/** Alta o edición de una provincia (solo Administración). */
export async function guardarProvinciaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaProvincia.safeParse({
    ...valores,
    id: valores.id || undefined,
    activa: valores.activa === "on",
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const r = await guardarProvincia(await obtenerDb(), datos.data, user.id);
  if (!r.ok) return { ...MENSAJES_PROVINCIA[r.error], valores };
  revalidatePath("/admin/paises");
  return { ok: true, mensaje: `Guardamos ${datos.data.nombre}.` };
}

/** Alta o edición de una condición frente al IVA (solo Administración). */
export async function guardarCondicionIvaAccion(
  _: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { user } = await requerirSofteam(["ADMINISTRACION"]);
  const valores = valoresDe(formData);
  const datos = esquemaCondicionIva.safeParse({
    ...valores,
    codigo: valores.codigo || undefined,
    activa: valores.activa === "on",
  });
  if (!datos.success) return { errores: erroresPorCampo(datos.error), valores };
  const r = await guardarCondicionIva(await obtenerDb(), datos.data, user.id);
  if (!r.ok) return { ...MENSAJES_CONDICION[r.error], valores };
  revalidatePath("/admin/paises");
  return { ok: true, mensaje: `Guardamos ${datos.data.nombre}: rige para las órdenes nuevas.` };
}
