import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { esCuitValido, normalizarCuit } from "@/domain/cuentas/cuit";
import type { EmisorParaVenta } from "@/domain/facturacion/emisor";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { cifrar, descifrar } from "@/server/seguridad/cifrado";
import { auditar } from "../auditoria";

/*
 * Emisores: las sociedades de SOFTeam que facturan, con su
 * conexión propia a Xubio y a Mercado Pago. Los secretos se cifran al guardar,
 * se descifran solo para llamar a la API y nunca salen en listados ni en la
 * auditoría.
 */

/** Emisores para la pantalla de SOFTeam: sin secretos, solo si están cargados. */
export async function listarEmisores(db: Ejecutor) {
  const filas = await db.select().from(t.emisores).orderBy(asc(t.emisores.razonSocial));
  return filas.map(
    ({ xubioSecretoCifrado, mpAccessTokenCifrado, mpSecretoAvisosCifrado, ...e }) => ({
      ...e,
      xubioSecretoCargado: Boolean(xubioSecretoCifrado),
      mpAccessTokenCargado: Boolean(mpAccessTokenCifrado),
      mpSecretoAvisosCargado: Boolean(mpSecretoAvisosCifrado),
    }),
  );
}

export type EmisorListado = Awaited<ReturnType<typeof listarEmisores>>[number];

/** Emisores activos, para elegir en la ficha del cliente. */
export function opcionesEmisores(db: Ejecutor) {
  return db
    .select({ id: t.emisores.id, razonSocial: t.emisores.razonSocial, cuit: t.emisores.cuit })
    .from(t.emisores)
    .where(eq(t.emisores.activo, true))
    .orderBy(asc(t.emisores.razonSocial));
}

export interface EmisorDeVenta extends EmisorParaVenta {
  razonSocial: string;
  cuit: string;
}

const columnasVenta = {
  id: t.emisores.id,
  activo: t.emisores.activo,
  mercadoPago: t.emisores.mercadoPago,
  razonSocial: t.emisores.razonSocial,
  cuit: t.emisores.cuit,
};

/** El emisor asignado y el preferido del país, para resolver el emisor de una venta. */
export async function emisoresParaVenta(
  db: Ejecutor,
  emisorIds: readonly string[],
  paisId: string,
): Promise<{ porId: Map<string, EmisorDeVenta>; preferido: EmisorDeVenta | undefined }> {
  const [asignados, [preferido]] = await Promise.all([
    emisorIds.length
      ? db
          .select(columnasVenta)
          .from(t.emisores)
          .where(inArray(t.emisores.id, [...emisorIds]))
      : [],
    db
      .select(columnasVenta)
      .from(t.emisores)
      .where(
        and(
          eq(t.emisores.paisId, paisId),
          eq(t.emisores.preferido, true),
          eq(t.emisores.activo, true),
        ),
      ),
  ]);
  return { porId: new Map(asignados.map((e) => [e.id, e])), preferido };
}

/** Credenciales descifradas de un emisor, para conectarse a Xubio o a Mercado Pago. */
export async function credencialesEmisor(db: Ejecutor, emisorId: string, claveMaestra: string) {
  const e = await db.query.emisores.findFirst({ where: eq(t.emisores.id, emisorId) });
  if (!e) return undefined;
  const abrir = (valor: string | null) => (valor ? descifrar(valor, claveMaestra) : undefined);
  return {
    activo: e.activo,
    xubio: e.xubio
      ? {
          clientId: e.xubioClientId ?? undefined,
          secretId: abrir(e.xubioSecretoCifrado),
          puntoVentaId: e.xubioPuntoVentaId ?? undefined,
          productoId: e.xubioProductoId ?? undefined,
          centroDeCostoId: e.xubioCentroCostoId ?? undefined,
        }
      : null,
    mercadoPago: e.mercadoPago
      ? { token: abrir(e.mpAccessTokenCifrado), secretoAvisos: abrir(e.mpSecretoAvisosCifrado) }
      : null,
  };
}

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();
const entero = z.coerce.number().int().positive().optional();

export const esquemaEmisor = z.object({
  id: z.uuid().optional(),
  razonSocial: z.string().trim().min(3, { error: "Ingresá la razón social." }).max(120),
  cuit: z
    .string()
    .transform(normalizarCuit)
    .refine(esCuitValido, { error: "El CUIT no es válido." }),
  condicionIva: z.string().trim().min(1, { error: "Elegí la condición frente al IVA." }).max(30),
  domicilioFiscal: z.string().trim().min(5, { error: "Ingresá el domicilio fiscal." }).max(160),
  paisId: z.string().length(2),
  puntoVenta: entero,
  preferido: z.boolean(),
  activo: z.boolean(),
  xubio: z.boolean(),
  xubioClientId: opcional(100),
  /** Vacío: conserva el que estaba. */
  xubioSecreto: opcional(500),
  xubioPuntoVentaId: entero,
  xubioProductoId: entero,
  xubioCentroCostoId: entero,
  mercadoPago: z.boolean(),
  mpAccessToken: opcional(500),
  mpSecretoAvisos: opcional(500),
});

export type EntradaEmisor = z.infer<typeof esquemaEmisor>;
export type ErrorEmisor = "NO_EXISTE" | "CUIT_DUPLICADO" | "CONDICION_INVALIDA";

/**
 * Alta o edición de un emisor (Administración). Tiene que ser Responsable
 * Inscripto (emite A y B). Marcarlo preferido desmarca al anterior del país.
 */
export async function guardarEmisor(
  db: Db,
  entrada: EntradaEmisor,
  actorId: string,
  claveMaestra: string,
): Promise<{ ok: true; id: string } | { ok: false; error: ErrorEmisor }> {
  return db.transaction(async (tx) => {
    const antes = entrada.id
      ? await tx.query.emisores.findFirst({ where: eq(t.emisores.id, entrada.id) })
      : undefined;
    if (entrada.id && !antes) return { ok: false, error: "NO_EXISTE" };
    const condicion = await tx.query.condicionesIva.findFirst({
      where: eq(t.condicionesIva.codigo, entrada.condicionIva),
    });
    if (!condicion?.activa || condicion.comprobante !== "A") {
      return { ok: false, error: "CONDICION_INVALIDA" };
    }
    const repetido = await tx.query.emisores.findFirst({
      columns: { id: true },
      where: and(
        eq(t.emisores.cuit, entrada.cuit),
        antes ? ne(t.emisores.id, antes.id) : undefined,
      ),
    });
    if (repetido) return { ok: false, error: "CUIT_DUPLICADO" };

    if (entrada.preferido && entrada.activo) {
      await tx
        .update(t.emisores)
        .set({ preferido: false })
        .where(
          and(
            eq(t.emisores.paisId, entrada.paisId),
            antes ? ne(t.emisores.id, antes.id) : undefined,
          ),
        );
    }
    const secreto = (nuevo: string | undefined, actual: string | null | undefined) =>
      nuevo ? cifrar(nuevo, claveMaestra) : (actual ?? null);
    const valores = {
      razonSocial: entrada.razonSocial,
      cuit: entrada.cuit,
      condicionIva: entrada.condicionIva,
      domicilioFiscal: entrada.domicilioFiscal,
      paisId: entrada.paisId,
      puntoVenta: entrada.puntoVenta ?? null,
      preferido: entrada.preferido && entrada.activo,
      activo: entrada.activo,
      xubio: entrada.xubio,
      xubioClientId: entrada.xubioClientId ?? null,
      xubioPuntoVentaId: entrada.xubioPuntoVentaId ?? null,
      xubioProductoId: entrada.xubioProductoId ?? null,
      xubioCentroCostoId: entrada.xubioCentroCostoId ?? null,
      mercadoPago: entrada.mercadoPago,
    };
    const secretos = {
      xubioSecretoCifrado: secreto(entrada.xubioSecreto, antes?.xubioSecretoCifrado),
      mpAccessTokenCifrado: secreto(entrada.mpAccessToken, antes?.mpAccessTokenCifrado),
      mpSecretoAvisosCifrado: secreto(entrada.mpSecretoAvisos, antes?.mpSecretoAvisosCifrado),
    };
    let id = antes?.id;
    if (antes) {
      await tx
        .update(t.emisores)
        .set({ ...valores, ...secretos, actualizadoEn: new Date() })
        .where(eq(t.emisores.id, antes.id));
    } else {
      const [nuevo] = await tx
        .insert(t.emisores)
        .values({ ...valores, ...secretos })
        .returning({ id: t.emisores.id });
      id = nuevo?.id;
    }
    if (!id) throw new Error("No se pudo guardar el emisor");
    // Los secretos no van a la auditoría: solo si se cambiaron.
    const cambiados = Object.entries({
      xubioSecreto: entrada.xubioSecreto,
      mpAccessToken: entrada.mpAccessToken,
      mpSecretoAvisos: entrada.mpSecretoAvisos,
    })
      .filter(([, v]) => v)
      .map(([k]) => k);
    await auditar(tx, {
      actorId,
      entidad: "emisor",
      entidadId: id,
      accion: antes ? "modificacion" : "alta",
      antes: antes
        ? {
            razonSocial: antes.razonSocial,
            cuit: antes.cuit,
            preferido: antes.preferido,
            activo: antes.activo,
            xubio: antes.xubio,
            mercadoPago: antes.mercadoPago,
          }
        : null,
      despues: { ...valores, secretosCambiados: cambiados },
    });
    return { ok: true, id };
  });
}
