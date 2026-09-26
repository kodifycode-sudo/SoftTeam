import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { COLOR_HEX, type ErrorLogo, validarLogo } from "@/domain/cuentas/marca";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "../auditoria";
import { registrarCambioEmpresa } from "../integraciones/eventos";

/** Marca de la empresa, sin los bytes del logo (se sirven aparte). */
export async function leerMarca(db: Ejecutor, empresaId: string) {
  const [fila] = await db
    .select({
      nombreComercial: t.marcasEmpresa.nombreComercial,
      eslogan: t.marcasEmpresa.eslogan,
      colorPrimario: t.marcasEmpresa.colorPrimario,
      colorSecundario: t.marcasEmpresa.colorSecundario,
      logoTipo: t.marcasEmpresa.logoTipo,
      logoHash: t.marcasEmpresa.logoHash,
      textoBienvenida: t.marcasEmpresa.textoBienvenida,
      firmaMail: t.marcasEmpresa.firmaMail,
      web: t.marcasEmpresa.web,
      email: t.marcasEmpresa.email,
      telefono: t.marcasEmpresa.telefono,
      whatsapp: t.marcasEmpresa.whatsapp,
      actualizadaEn: t.marcasEmpresa.actualizadoEn,
    })
    .from(t.marcasEmpresa)
    .where(eq(t.marcasEmpresa.empresaId, empresaId));
  return fila;
}

export type Marca = NonNullable<Awaited<ReturnType<typeof leerMarca>>>;

export async function logoDeEmpresa(db: Ejecutor, empresaId: string) {
  const [fila] = await db
    .select({
      logo: t.marcasEmpresa.logo,
      tipo: t.marcasEmpresa.logoTipo,
      hash: t.marcasEmpresa.logoHash,
    })
    .from(t.marcasEmpresa)
    .where(eq(t.marcasEmpresa.empresaId, empresaId));
  return fila?.logo && fila.tipo && fila.hash
    ? { bytes: fila.logo, tipo: fila.tipo, hash: fila.hash }
    : undefined;
}

const opcional = (max: number) => z.string().trim().max(max).optional();
const color = z
  .string()
  .trim()
  .regex(COLOR_HEX, { error: "Color inválido (#RRGGBB)" })
  .transform((c) => c.toLowerCase())
  .optional();

export const esquemaMarca = z.object({
  nombreComercial: opcional(80),
  eslogan: opcional(120),
  colorPrimario: color,
  colorSecundario: color,
  textoBienvenida: opcional(500),
  firmaMail: opcional(300),
  web: z
    .url({ protocol: /^https?$/, error: "Ingresá una dirección web completa (https://…)" })
    .max(160)
    .optional(),
  email: z.email({ error: "Ingresá un mail válido" }).trim().toLowerCase().max(160).optional(),
  telefono: opcional(30),
  whatsapp: opcional(30),
});

export type EntradaMarca = z.infer<typeof esquemaMarca>;

export type CambioLogo =
  | { accion: "MANTENER" }
  | { accion: "QUITAR" }
  | { accion: "REEMPLAZAR"; bytes: Uint8Array };

/**
 * Guarda la marca de la empresa. El logo se valida por su contenido (PNG,
 * JPEG o WebP; hasta 300 KB) y se guarda con su hash, que los productos usan
 * para cachearlo. Los productos se enteran del cambio por webhook.
 */
export async function guardarMarca(
  db: Db,
  empresaId: string,
  entrada: EntradaMarca,
  logo: CambioLogo,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorLogo }> {
  let datosLogo:
    | { logo: Buffer | null; logoTipo: string | null; logoHash: string | null }
    | undefined;
  if (logo.accion === "QUITAR") datosLogo = { logo: null, logoTipo: null, logoHash: null };
  if (logo.accion === "REEMPLAZAR") {
    const validado = validarLogo(logo.bytes);
    if (!validado.ok) return validado;
    datosLogo = {
      logo: Buffer.from(logo.bytes),
      logoTipo: validado.tipo,
      logoHash: createHash("sha256").update(logo.bytes).digest("hex"),
    };
  }

  const valores = {
    nombreComercial: entrada.nombreComercial || null,
    eslogan: entrada.eslogan || null,
    colorPrimario: entrada.colorPrimario ?? null,
    colorSecundario: entrada.colorSecundario ?? null,
    textoBienvenida: entrada.textoBienvenida || null,
    firmaMail: entrada.firmaMail || null,
    web: entrada.web ?? null,
    email: entrada.email ?? null,
    telefono: entrada.telefono || null,
    whatsapp: entrada.whatsapp || null,
    ...datosLogo,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(t.marcasEmpresa)
      .values({ empresaId, ...valores })
      .onConflictDoUpdate({ target: t.marcasEmpresa.empresaId, set: valores });
    await registrarCambioEmpresa(tx, [empresaId]);
    const { logo: _bytes, ...auditable } = valores;
    await auditar(tx, {
      actorId,
      entidad: "marca",
      entidadId: empresaId,
      accion: "modificacion",
      empresaId,
      despues: { ...auditable, logo: logo.accion },
    });
  });
  return { ok: true };
}

/** Marca en el formato de la API para productos (EmpresaFull_V1). */
export function marcaParaApi(marca: Marca | undefined, urlLogo: string) {
  if (!marca) return null;
  return {
    nombreComercial: marca.nombreComercial,
    eslogan: marca.eslogan,
    colores: { primario: marca.colorPrimario, secundario: marca.colorSecundario },
    logo: marca.logoHash
      ? {
          url: `${urlLogo}?v=${marca.logoHash.slice(0, 16)}`,
          tipo: marca.logoTipo,
          hash: marca.logoHash,
        }
      : null,
    textos: { bienvenida: marca.textoBienvenida, firmaMail: marca.firmaMail },
    contacto: {
      web: marca.web,
      email: marca.email,
      telefono: marca.telefono,
      whatsapp: marca.whatsapp,
    },
    actualizadaEn: marca.actualizadaEn.toISOString(),
  };
}
