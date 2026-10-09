import { eq } from "drizzle-orm";
import { z } from "zod";
import { esCuitValido, normalizarCuit } from "@/domain/cuentas/cuit";
import { TIPOS_SOCIEDAD } from "@/lib/argentina";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { condicionIvaValida } from "../catalogo/condiciones-iva";
import { provinciaValida } from "../catalogo/paises";
import { registrarCambioEmpresa } from "../integraciones/eventos";
import { crearAdministradorGeneral, crearCliente, crearEmpresa } from "./creacion";
import { buscarUsuarioPorEmail, type UsuarioLogin } from "./usuarios";

const esDeSofteam = async (tx: Ejecutor, email: string) =>
  Boolean((await buscarUsuarioPorEmail(tx, email))?.rolSofteam);

/*
 * Altas que hace SOFTeam: un cliente que no se registra solo (por ejemplo,
 * un corporativo) y una empresa más para un cliente existente.
 */

const texto = (min: number, max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .min(min, { error: mensaje })
    .max(max, { error: `Máximo ${max} caracteres` });
const telefono = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{8,20}$/, { error: "Ingresá un teléfono con código de área" })
  .optional();

const administrador = z.object({
  nombre: texto(3, 120, "Ingresá el nombre del administrador"),
  email: z.email({ error: "Ingresá un mail válido" }).trim().toLowerCase(),
  telefono,
});

const empresa = z.object({
  nombre: z.string().trim().max(120).optional(),
  nombreCorto: z.string().trim().max(20).optional(),
  tipoInstalacion: z.enum(["SAAS", "ON_PREMISE"]),
});

/** Modo de facturación del cliente (Mejora v2.1, 7.6). */
export const campoModoFacturacion = z.coerce
  .number({ error: "Elegí el modo de facturación" })
  .int()
  .min(0, { error: "Elegí el modo de facturación" })
  .max(3, { error: "Elegí el modo de facturación" });

export const esquemaAltaCliente = z.object({
  tipoPersona: z.enum(["FISICA", "JURIDICA"]),
  modoFacturacion: campoModoFacturacion,
  /** Vacío: el emisor preferido del país. */
  emisorId: z.uuid().optional(),
  nombre: texto(3, 120, "Ingresá el nombre o la razón social"),
  tipoSociedad: z.enum(TIPOS_SOCIEDAD).optional(),
  cuit: z
    .string()
    .transform(normalizarCuit)
    .refine(esCuitValido, { error: "El CUIT/CUIL no es válido" }),
  condicionIva: z
    .string({ error: "Elegí la condición frente al IVA" })
    .trim()
    .min(1, { error: "Elegí la condición frente al IVA" })
    .max(30),
  domicilioFiscal: z.object({
    calle: texto(3, 120, "Ingresá la dirección"),
    ciudad: texto(2, 60, "Ingresá la localidad"),
    codigoPostal: texto(4, 8, "Ingresá el código postal"),
    provincia: z.string().trim().min(2, { error: "Elegí la provincia" }).max(60),
  }),
  administrador,
  empresa,
});

export type EntradaAltaCliente = z.infer<typeof esquemaAltaCliente>;

export type ResultadoAlta =
  | { ok: true; clienteId: string; empresaId: string; usuario: UsuarioLogin }
  | { ok: false; error: "CUIT_DUPLICADO"; clienteId: string }
  | {
      ok: false;
      error: "ES_SOFTEAM" | "NO_EXISTE" | "PROVINCIA_INVALIDA" | "CONDICION_IVA_INVALIDA";
    };

/** Alta de cliente por SOFTeam: cliente, su primera empresa y el administrador general. */
export async function altaClientePorSofteam(
  db: Db,
  entrada: EntradaAltaCliente,
  actorId: string,
): Promise<ResultadoAlta> {
  return db.transaction(async (tx) => {
    const existente = await tx.query.clientes.findFirst({
      columns: { id: true },
      where: eq(t.clientes.cuit, entrada.cuit),
    });
    if (existente) return { ok: false, error: "CUIT_DUPLICADO", clienteId: existente.id };
    // Un mail de SOFTeam no puede administrar un cliente: se valida antes de crear nada.
    if (await esDeSofteam(tx, entrada.administrador.email))
      return { ok: false, error: "ES_SOFTEAM" };
    if (!(await provinciaValida(tx, "AR", entrada.domicilioFiscal.provincia))) {
      return { ok: false, error: "PROVINCIA_INVALIDA" };
    }
    if (!(await condicionIvaValida(tx, "AR", entrada.condicionIva))) {
      return { ok: false, error: "CONDICION_IVA_INVALIDA" };
    }

    const contacto = {
      nombre: entrada.administrador.nombre,
      email: entrada.administrador.email,
      telefono: entrada.administrador.telefono ?? null,
    };
    const cliente = await crearCliente(tx, {
      modoFacturacion: entrada.modoFacturacion,
      emisorId: entrada.emisorId,
      tipoPersona: entrada.tipoPersona,
      nombre: entrada.nombre,
      tipoSociedad: entrada.tipoPersona === "JURIDICA" ? (entrada.tipoSociedad ?? null) : null,
      cuit: entrada.cuit,
      condicionIva: entrada.condicionIva,
      domicilioFiscal: { ...entrada.domicilioFiscal, paisId: "AR" },
      contactoAdministrador: contacto,
    });
    const nueva = await crearEmpresa(tx, {
      clienteId: cliente.id,
      nombre: entrada.empresa.nombre || entrada.nombre,
      nombreCorto: entrada.empresa.nombreCorto || undefined,
      tipoInstalacion: entrada.empresa.tipoInstalacion,
      oficina: {
        telefono: contacto.telefono,
        domicilio: `${entrada.domicilioFiscal.calle}, ${entrada.domicilioFiscal.ciudad}`,
      },
    });
    const usuario = await crearAdministradorGeneral(tx, nueva.id, contacto);
    if (!usuario) throw new Error("El administrador es de SOFTeam");
    await auditar(tx, {
      actorId,
      entidad: "cliente",
      entidadId: cliente.id,
      empresaId: nueva.id,
      accion: "alta",
      despues: { cuit: entrada.cuit, empresa: nueva.numero, administrador: contacto.email },
    });
    return { ok: true, clienteId: cliente.id, empresaId: nueva.id, usuario };
  });
}

export const esquemaNuevaEmpresa = z.object({
  empresa: empresa.extend({ nombre: texto(2, 120, "Ingresá el nombre de la empresa") }),
  administrador,
});

export type EntradaNuevaEmpresa = z.infer<typeof esquemaNuevaEmpresa>;

/**
 * Una empresa más para un cliente existente (otra instalación: su propia
 * licencia, usuarios y datos, facturada al mismo cliente).
 */
export async function nuevaEmpresaDeCliente(
  db: Db,
  clienteId: string,
  entrada: EntradaNuevaEmpresa,
  actorId: string,
): Promise<ResultadoAlta> {
  return db.transaction(async (tx) => {
    const cliente = await tx.query.clientes.findFirst({
      columns: { id: true, domicilioFiscal: true },
      where: eq(t.clientes.id, clienteId),
    });
    if (!cliente) return { ok: false, error: "NO_EXISTE" };
    if (await esDeSofteam(tx, entrada.administrador.email))
      return { ok: false, error: "ES_SOFTEAM" };
    const nueva = await crearEmpresa(tx, {
      clienteId,
      nombre: entrada.empresa.nombre,
      nombreCorto: entrada.empresa.nombreCorto || undefined,
      tipoInstalacion: entrada.empresa.tipoInstalacion,
      paisId: cliente.domicilioFiscal.paisId,
    });
    const usuario = await crearAdministradorGeneral(tx, nueva.id, {
      nombre: entrada.administrador.nombre,
      email: entrada.administrador.email,
      telefono: entrada.administrador.telefono ?? null,
    });
    if (!usuario) throw new Error("El administrador es de SOFTeam");
    await registrarCambioEmpresa(tx, [nueva.id]);
    await auditar(tx, {
      actorId,
      entidad: "empresa",
      entidadId: nueva.id,
      empresaId: nueva.id,
      accion: "alta",
      despues: { clienteId, numero: nueva.numero, administrador: entrada.administrador.email },
    });
    return { ok: true, clienteId, empresaId: nueva.id, usuario };
  });
}
