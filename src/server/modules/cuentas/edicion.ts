import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { esCuitValido, normalizarCuit } from "@/domain/cuentas/cuit";
import { TIPOS_SOCIEDAD } from "@/lib/argentina";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { condicionIvaValida } from "../catalogo/condiciones-iva";
import { provinciaValida } from "../catalogo/paises";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { campoModoFacturacion } from "./altas-softeam";

const texto = (min: number, max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .min(min, { error: mensaje })
    .max(max, { error: `Máximo ${max} caracteres` });
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Máximo ${max} caracteres` })
    .optional()
    .transform((v) => v || null);
const telefono = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{8,20}$/, { error: "Ingresá un teléfono con código de área" })
  .optional()
  .or(z.literal(""))
  .transform((v) => v || null);
const email = z
  .email({ error: "Ingresá un mail válido" })
  .trim()
  .toLowerCase()
  .optional()
  .or(z.literal(""))
  .transform((v) => v || null);

const domicilio = z.object({
  calle: texto(3, 120, "Ingresá la dirección"),
  ciudad: texto(2, 60, "Ingresá la localidad"),
  codigoPostal: texto(4, 8, "Ingresá el código postal"),
  provincia: z.string().trim().min(2, { error: "Elegí la provincia" }).max(60),
});

/** Contacto opcional: vacío si no se carga el nombre. */
const contacto = z.object({ nombre: opcional(120), email, telefono });

export const esquemaEdicionCliente = z
  .object({
    /** Marca de la última modificación que vio quien edita (control de concurrencia). */
    version: z.string().min(1),
    tipoPersona: z.enum(["FISICA", "JURIDICA"]),
    nombre: texto(3, 120, "Ingresá el nombre o la razón social"),
    tipoSociedad: z.enum(TIPOS_SOCIEDAD).optional(),
    nombreFactura: texto(3, 120, "Ingresá cómo sale en la factura"),
    cuit: z
      .string()
      .transform(normalizarCuit)
      .refine(esCuitValido, { error: "El CUIT/CUIL no es válido" }),
    condicionIva: z
      .string({ error: "Elegí la condición frente al IVA" })
      .trim()
      .min(1, { error: "Elegí la condición frente al IVA" })
      .max(30),
    domicilioFiscal: domicilio,
    /** Domicilio comercial: si no se carga, es el fiscal. */
    domicilioComercial: domicilio.partial().optional(),
    administrador: z.object({
      nombre: texto(3, 120, "Ingresá el nombre del administrador"),
      email: z.email({ error: "Ingresá un mail válido" }).trim().toLowerCase(),
      telefono,
    }),
    pagos: contacto,
    comercial: contacto,
    grupoId: z.uuid().optional(),
    medioPagoAltaId: z.uuid().optional(),
    medioPagoRenovacionId: z.uuid().optional(),
    modoFacturacion: campoModoFacturacion,
    /** Sociedad que le factura. Solo Administración la cambia. */
    emisorId: z.uuid().optional(),
    xubioId: opcional(40),
    observacionFactura: opcional(200),
    observaciones: opcional(2000),
    activo: z.boolean(),
  })
  .superRefine((d, ctx) => {
    const comercial = d.domicilioComercial;
    const cargado = comercial && Object.values(comercial).some(Boolean);
    if (cargado && !domicilio.safeParse(comercial).success) {
      ctx.addIssue({
        code: "custom",
        path: ["domicilioComercial", "calle"],
        message: "Completá el domicilio comercial o dejalo vacío",
      });
    }
  });

export type EntradaEdicionCliente = z.infer<typeof esquemaEdicionCliente>;

export type ErrorEdicion =
  | "NO_EXISTE"
  | "CONFLICTO"
  | "CUIT_DUPLICADO"
  | "SIN_PERMISO"
  | "GRUPO_INVALIDO"
  | "MEDIO_INVALIDO"
  | "PROVINCIA_INVALIDA"
  | "CONDICION_IVA_INVALIDA"
  | "EMISOR_INVALIDO";

/** Quién edita: el CUIT y dar de baja son solo de Administración. */
export interface Editor {
  usuarioId: string;
  administracion: boolean;
}

const aContacto = (c: { nombre: string | null; email: string | null; telefono: string | null }) =>
  c.nombre ? { nombre: c.nombre, email: c.email, telefono: c.telefono } : null;

/**
 * SOFTeam corrige los datos de un cliente. Lo que ve la factura (razón
 * social, CUIT, IVA, domicilio) rige para las órdenes nuevas: las ya
 * emitidas conservan lo que congelaron. Cambiar el CUIT (es otra persona
 * jurídica) o dar de baja al cliente es solo de Administración.
 */
export async function guardarCliente(
  db: Db,
  clienteId: string,
  entrada: EntradaEdicionCliente,
  editor: Editor,
): Promise<{ ok: true; emisorCambiado: boolean } | { ok: false; error: ErrorEdicion }> {
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select()
      .from(t.clientes)
      .where(eq(t.clientes.id, clienteId))
      .for("update");
    if (!antes) return { ok: false, error: "NO_EXISTE" };
    if (antes.actualizadoEn.toISOString() !== entrada.version) {
      return { ok: false, error: "CONFLICTO" };
    }
    const cambiaCuit = antes.cuit !== entrada.cuit;
    if ((cambiaCuit || antes.activo !== entrada.activo) && !editor.administracion) {
      return { ok: false, error: "SIN_PERMISO" };
    }
    if (cambiaCuit) {
      const otro = await tx.query.clientes.findFirst({
        columns: { id: true },
        where: and(eq(t.clientes.cuit, entrada.cuit), ne(t.clientes.id, clienteId)),
      });
      if (otro) return { ok: false, error: "CUIT_DUPLICADO" };
    }
    if (entrada.grupoId) {
      const grupo = await tx.query.gruposEconomicos.findFirst({
        columns: { id: true },
        where: eq(t.gruposEconomicos.id, entrada.grupoId),
      });
      if (!grupo) return { ok: false, error: "GRUPO_INVALIDO" };
    }
    for (const medio of [entrada.medioPagoAltaId, entrada.medioPagoRenovacionId]) {
      if (!medio) continue;
      const existe = await tx.query.mediosPago.findFirst({
        columns: { id: true, modosFacturacion: true },
        where: eq(t.mediosPago.id, medio),
      });
      // Solo medios habilitados para el modo de facturación del cliente.
      if (!existe?.modosFacturacion.includes(entrada.modoFacturacion)) {
        return { ok: false, error: "MEDIO_INVALIDO" };
      }
    }

    const paisId = antes.domicilioFiscal.paisId;
    const comercial = entrada.domicilioComercial;
    for (const provincia of [entrada.domicilioFiscal.provincia, comercial?.provincia]) {
      if (provincia && !(await provinciaValida(tx, paisId, provincia))) {
        return { ok: false, error: "PROVINCIA_INVALIDA" };
      }
    }
    // Se puede conservar una condición que se dio de baja, pero no pasar a una.
    if (
      entrada.condicionIva !== antes.condicionIva &&
      !(await condicionIvaValida(tx, paisId, entrada.condicionIva))
    ) {
      return { ok: false, error: "CONDICION_IVA_INVALIDA" };
    }
    const emisorCambiado = Boolean(entrada.emisorId && entrada.emisorId !== antes.emisorId);
    if (emisorCambiado) {
      if (!editor.administracion) return { ok: false, error: "SIN_PERMISO" };
      const emisor = await tx.query.emisores.findFirst({
        columns: { activo: true },
        where: eq(t.emisores.id, entrada.emisorId as string),
      });
      if (!emisor?.activo) return { ok: false, error: "EMISOR_INVALIDO" };
    }
    const valores = {
      tipoPersona: entrada.tipoPersona,
      nombre: entrada.nombre,
      tipoSociedad: entrada.tipoPersona === "JURIDICA" ? (entrada.tipoSociedad ?? null) : null,
      nombreFactura: entrada.nombreFactura,
      cuit: entrada.cuit,
      condicionIva: entrada.condicionIva,
      domicilioFiscal: { ...entrada.domicilioFiscal, paisId },
      domicilioComercial:
        comercial?.calle && comercial.ciudad && comercial.codigoPostal && comercial.provincia
          ? {
              calle: comercial.calle,
              ciudad: comercial.ciudad,
              codigoPostal: comercial.codigoPostal,
              provincia: comercial.provincia,
              paisId,
            }
          : null,
      contactoAdministrador: {
        nombre: entrada.administrador.nombre,
        email: entrada.administrador.email,
        telefono: entrada.administrador.telefono,
      },
      contactoPagos: aContacto(entrada.pagos),
      contactoComercial: aContacto(entrada.comercial),
      grupoId: entrada.grupoId ?? null,
      medioPagoAltaId: entrada.medioPagoAltaId ?? null,
      medioPagoRenovacionId: entrada.medioPagoRenovacionId ?? null,
      modoFacturacion: entrada.modoFacturacion,
      emisorId: entrada.emisorId ?? antes.emisorId,
      xubioId: entrada.xubioId,
      observacionFactura: entrada.observacionFactura,
      observaciones: entrada.observaciones,
      activo: entrada.activo,
    };
    await tx.update(t.clientes).set(valores).where(eq(t.clientes.id, clienteId));
    const empresas = await tx
      .select({ id: t.empresas.id })
      .from(t.empresas)
      .where(eq(t.empresas.clienteId, clienteId));
    const { id: _id, numero: _n, creadoEn: _c, actualizadoEn: _a, ...previo } = antes;
    await auditar(tx, {
      actorId: editor.usuarioId,
      entidad: "cliente",
      entidadId: clienteId,
      // El historial de cada empresa del cliente también lo muestra.
      empresaId: empresas[0]?.id,
      accion:
        antes.activo !== entrada.activo
          ? entrada.activo
            ? "reactivacion"
            : "baja"
          : "modificacion",
      antes: previo,
      despues: valores,
    });
    return { ok: true, emisorCambiado };
  });
}

export const esquemaEdicionEmpresa = z.object({
  version: z.string().min(1),
  nombre: texto(2, 120, "Ingresá el nombre de la empresa"),
  nombreCorto: texto(2, 20, "Ingresá un nombre corto (hasta 20)"),
  tipoInstalacion: z.enum(["SAAS", "ON_PREMISE"]),
  activa: z.boolean(),
});

export type EntradaEdicionEmpresa = z.infer<typeof esquemaEdicionEmpresa>;

/**
 * SOFTeam corrige una empresa. Desactivarla (solo Administración) corta el acceso al portal y los
 * consumos de los productos; los productos reciben el cambio.
 */
export async function guardarEmpresa(
  db: Db,
  empresaId: string,
  entrada: EntradaEdicionEmpresa,
  editor: Editor,
): Promise<{ ok: true } | { ok: false; error: ErrorEdicion }> {
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select()
      .from(t.empresas)
      .where(eq(t.empresas.id, empresaId))
      .for("update");
    if (!antes) return { ok: false, error: "NO_EXISTE" };
    if (antes.actualizadoEn.toISOString() !== entrada.version) {
      return { ok: false, error: "CONFLICTO" };
    }
    if (antes.activa !== entrada.activa && !editor.administracion) {
      return { ok: false, error: "SIN_PERMISO" };
    }
    const { version: _v, ...valores } = entrada;
    await tx.update(t.empresas).set(valores).where(eq(t.empresas.id, empresaId));
    await registrarCambioEmpresa(tx, [empresaId]);
    await auditar(tx, {
      actorId: editor.usuarioId,
      entidad: "empresa",
      entidadId: empresaId,
      empresaId,
      accion:
        antes.activa !== entrada.activa
          ? entrada.activa
            ? "reactivacion"
            : "baja"
          : "modificacion",
      antes: {
        nombre: antes.nombre,
        nombreCorto: antes.nombreCorto,
        tipoInstalacion: antes.tipoInstalacion,
        activa: antes.activa,
      },
      despues: valores,
    });
    return { ok: true };
  });
}
