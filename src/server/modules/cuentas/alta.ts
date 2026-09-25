import { eq } from "drizzle-orm";
import { z } from "zod";
import { esCuitValido, normalizarCuit } from "@/domain/cuentas/cuit";
import { CONDICIONES_IVA } from "@/domain/facturacion/impuestos";
import { PROVINCIAS, TIPOS_SOCIEDAD } from "@/lib/argentina";
import type { Db } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { POLITICAS_POR_DEFECTO } from "@/server/db/schema/configuracion";

const texto = (min: number, max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .min(min, { error: mensaje })
    .max(max, { error: `Máximo ${max} caracteres` });

const telefono = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{8,20}$/, { error: "Ingresá un teléfono con código de área" });

/** Datos del alta en línea (paso 1). La contraseña no se guarda en la solicitud. */
export const esquemaDatosAlta = z
  .object({
    tipoPersona: z.enum(["FISICA", "JURIDICA"], { error: "Elegí el tipo de persona" }),
    nombre: texto(3, 120, "Ingresá apellido y nombre"),
    razonSocial: z.string().trim().max(120).optional(),
    tipoSociedad: z.enum(TIPOS_SOCIEDAD).optional(),
    cuit: z
      .string()
      .transform(normalizarCuit)
      .refine(esCuitValido, { error: "El CUIT/CUIL no es válido" }),
    condicionIva: z.enum(CONDICIONES_IVA, { error: "Elegí la condición frente al IVA" }),
    telefono,
    email: z.email({ error: "Ingresá un mail válido" }).trim().toLowerCase(),
    calle: texto(3, 120, "Ingresá la dirección"),
    ciudad: texto(2, 60, "Ingresá la localidad"),
    codigoPostal: texto(4, 8, "Ingresá el código postal"),
    provincia: z.enum(PROVINCIAS, { error: "Elegí la provincia" }),
    aceptaNotificaciones: z.boolean().default(false),
  })
  .superRefine((datos, ctx) => {
    if (datos.tipoPersona === "JURIDICA" && !datos.razonSocial) {
      ctx.addIssue({ code: "custom", path: ["razonSocial"], message: "Ingresá la razón social" });
    }
  });

export type DatosAlta = z.infer<typeof esquemaDatosAlta>;

/** Contraseña fuerte: 10+ caracteres con mayúscula, minúscula y número. */
export const esquemaContrasena = z
  .string()
  .min(10, { error: "Al menos 10 caracteres" })
  .max(128)
  .regex(/[a-z]/, { error: "Incluí una minúscula" })
  .regex(/[A-Z]/, { error: "Incluí una mayúscula" })
  .regex(/\d/, { error: "Incluí un número" });

export async function existeClienteConCuit(db: Db, cuit: string): Promise<boolean> {
  const fila = await db.query.clientes.findFirst({
    columns: { id: true },
    where: eq(t.clientes.cuit, normalizarCuit(cuit)),
  });
  return fila !== undefined;
}

export async function guardarSolicitudAlta(db: Db, usuarioId: string, datos: DatosAlta) {
  await db
    .insert(t.solicitudesAlta)
    .values({ usuarioId, datos })
    .onConflictDoUpdate({ target: t.solicitudesAlta.usuarioId, set: { datos } });
}

function nombreCorto(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase();
  return (limpio.split(/\s+/)[0] ?? "EMPRESA").slice(0, 20) || "EMPRESA";
}

/**
 * Confirma un alta con el mail ya verificado: crea cliente, empresa, canal y
 * oficina 01-001, el colaborador administrador y las políticas por defecto,
 * todo en una transacción. Idempotente: si ya se confirmó, devuelve lo creado.
 */
export async function confirmarAlta(db: Db, usuarioId: string): Promise<{ empresaId: string }> {
  return db.transaction(async (tx) => {
    const [solicitud] = await tx
      .select()
      .from(t.solicitudesAlta)
      .where(eq(t.solicitudesAlta.usuarioId, usuarioId))
      .for("update");
    if (!solicitud) throw new Error("No hay una solicitud de alta para este usuario");

    if (solicitud.clienteId) {
      const empresa = await tx.query.empresas.findFirst({
        columns: { id: true },
        where: eq(t.empresas.clienteId, solicitud.clienteId),
      });
      if (empresa) return { empresaId: empresa.id };
    }

    const datos = esquemaDatosAlta.parse(solicitud.datos);
    const denominacion =
      datos.tipoPersona === "JURIDICA" ? (datos.razonSocial ?? datos.nombre) : datos.nombre;
    const domicilio = {
      calle: datos.calle,
      ciudad: datos.ciudad,
      codigoPostal: datos.codigoPostal,
      provincia: datos.provincia,
      paisId: "AR",
    };
    const administrador = { nombre: datos.nombre, email: datos.email, telefono: datos.telefono };

    const [cliente] = await tx
      .insert(t.clientes)
      .values({
        tipoPersona: datos.tipoPersona,
        nombre: denominacion,
        tipoSociedad: datos.tipoSociedad,
        nombreFactura: denominacion,
        cuit: datos.cuit,
        condicionIva: datos.condicionIva,
        domicilioFiscal: domicilio,
        domicilioComercial: domicilio,
        contactoAdministrador: administrador,
        contactoPagos: administrador,
        contactoComercial: administrador,
      })
      .returning({ id: t.clientes.id });
    if (!cliente) throw new Error("No se pudo crear el cliente");

    const [empresa] = await tx
      .insert(t.empresas)
      .values({
        clienteId: cliente.id,
        nombre: denominacion,
        nombreCorto: nombreCorto(denominacion),
        paisId: "AR",
      })
      .returning({ id: t.empresas.id });
    if (!empresa) throw new Error("No se pudo crear la empresa");

    const [canal] = await tx
      .insert(t.canales)
      .values({ empresaId: empresa.id, codigo: "01", nombre: "Casa central" })
      .returning({ id: t.canales.id });
    if (!canal) throw new Error("No se pudo crear el canal");

    await tx.insert(t.oficinas).values({
      empresaId: empresa.id,
      canalId: canal.id,
      codigo: "001",
      nombre: "Casa central",
      telefono: datos.telefono,
      domicilio: `${datos.calle}, ${datos.ciudad}`,
    });
    await tx.insert(t.colaboradores).values({
      empresaId: empresa.id,
      nombre: datos.nombre,
      email: datos.email,
      telefono: datos.telefono,
      adminGeneral: true,
      adminComercial: true,
      adminOperativo: true,
      usuarioId,
    });
    await tx
      .insert(t.politicasEmpresa)
      .values({ empresaId: empresa.id, politicas: POLITICAS_POR_DEFECTO });
    await tx
      .update(t.solicitudesAlta)
      .set({ confirmadaEn: new Date(), clienteId: cliente.id })
      .where(eq(t.solicitudesAlta.id, solicitud.id));
    await tx.insert(t.auditoria).values({
      actorId: usuarioId,
      actorTipo: "usuario",
      entidad: "cliente",
      entidadId: cliente.id,
      accion: "alta_en_linea",
      despues: { clienteId: cliente.id, empresaId: empresa.id, cuit: datos.cuit },
    });
    return { empresaId: empresa.id };
  });
}
