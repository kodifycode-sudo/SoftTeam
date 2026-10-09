import { and, eq, sql } from "drizzle-orm";
import type { Ejecutor } from "@/server/db/cliente";
import type { Contacto, Domicilio } from "@/server/db/schema";
import * as t from "@/server/db/schema";
import { POLITICAS_POR_DEFECTO } from "@/server/db/schema/configuracion";
import { asegurarUsuario, normalizarEmail, type UsuarioLogin } from "./usuarios";

/*
 * Alta de clientes y empresas con su estructura mínima. La usan el alta en
 * línea, el alta por SOFTeam y la importación.
 */

/** Nombre corto a partir de la denominación: la primera palabra, sin acentos, hasta 20. */
export function nombreCorto(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .toUpperCase();
  return (limpio.split(/\s+/)[0] ?? "EMPRESA").slice(0, 20) || "EMPRESA";
}

export interface DatosCliente {
  tipoPersona: "FISICA" | "JURIDICA";
  nombre: string;
  tipoSociedad?: string | null;
  nombreFactura?: string;
  cuit: string;
  condicionIva: (typeof t.clientes.$inferInsert)["condicionIva"];
  domicilioFiscal: Domicilio;
  domicilioComercial?: Domicilio | null;
  contactoAdministrador: Contacto;
  contactoPagos?: Contacto | null;
  contactoComercial?: Contacto | null;
  grupoId?: string | null;
  xubioId?: string | null;
  observaciones?: string | null;
  observacionFactura?: string | null;
  /** Modo de facturación (0 a 3). Por defecto, pago directo. */
  modoFacturacion?: number;
  /** Sociedad que le factura. Por defecto, la preferida de su país. */
  emisorId?: string | null;
  activo?: boolean;
  /** Número que traía el cliente en el sistema anterior (importación). */
  numero?: number | null;
}

export async function crearCliente(tx: Ejecutor, datos: DatosCliente) {
  const { numero, ...resto } = datos;
  const preferido =
    datos.emisorId === undefined
      ? await tx.query.emisores.findFirst({
          columns: { id: true },
          where: and(
            eq(t.emisores.paisId, datos.domicilioFiscal.paisId),
            eq(t.emisores.preferido, true),
            eq(t.emisores.activo, true),
          ),
        })
      : undefined;
  const valores = {
    ...resto,
    emisorId: datos.emisorId ?? preferido?.id ?? null,
    nombreFactura: datos.nombreFactura ?? datos.nombre,
    domicilioComercial: datos.domicilioComercial ?? datos.domicilioFiscal,
    contactoPagos: datos.contactoPagos ?? null,
    contactoComercial: datos.contactoComercial ?? null,
  };
  const [cliente] = numero
    ? await tx
        .insert(t.clientes)
        .overridingSystemValue()
        .values({ ...valores, numero })
        .returning({ id: t.clientes.id, numero: t.clientes.numero })
    : await tx
        .insert(t.clientes)
        .values(valores)
        .returning({ id: t.clientes.id, numero: t.clientes.numero });
  if (!cliente) throw new Error("No se pudo crear el cliente");
  if (numero) await ajustarNumerador(tx, "clientes");
  return cliente;
}

export interface DatosEmpresa {
  clienteId: string;
  nombre: string;
  nombreCorto?: string;
  tipoInstalacion?: "SAAS" | "ON_PREMISE";
  activa?: boolean;
  paisId?: string;
  /** Número de la empresa en el sistema anterior: lo usan los productos, se conserva. */
  numero?: number | null;
  /** Datos de la oficina inicial (01-001, "Casa central"). */
  oficina?: { telefono?: string | null; domicilio?: string | null };
}

/**
 * Crea la empresa con lo que toda empresa tiene: canal 01, oficina 01-001
 * "Casa central" y las políticas por defecto.
 */
export async function crearEmpresa(tx: Ejecutor, datos: DatosEmpresa) {
  const valores = {
    clienteId: datos.clienteId,
    nombre: datos.nombre,
    nombreCorto: datos.nombreCorto || nombreCorto(datos.nombre),
    paisId: datos.paisId ?? "AR",
    tipoInstalacion: datos.tipoInstalacion ?? "SAAS",
    activa: datos.activa ?? true,
  };
  const [empresa] = datos.numero
    ? await tx
        .insert(t.empresas)
        .overridingSystemValue()
        .values({ ...valores, numero: datos.numero })
        .returning({ id: t.empresas.id, numero: t.empresas.numero })
    : await tx
        .insert(t.empresas)
        .values(valores)
        .returning({ id: t.empresas.id, numero: t.empresas.numero });
  if (!empresa) throw new Error("No se pudo crear la empresa");
  if (datos.numero) await ajustarNumerador(tx, "empresas");

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
    telefono: datos.oficina?.telefono ?? null,
    domicilio: datos.oficina?.domicilio ?? null,
  });
  await tx
    .insert(t.politicasEmpresa)
    .values({ empresaId: empresa.id, politicas: POLITICAS_POR_DEFECTO });
  return empresa;
}

/**
 * Tras insertar un número explícito (importación), adelanta la secuencia
 * para que las altas siguientes no choquen con los números importados.
 */
async function ajustarNumerador(tx: Ejecutor, tabla: "clientes" | "empresas") {
  await tx.execute(
    sql`select setval(pg_get_serial_sequence(${tabla}, 'numero'), greatest((select coalesce(max(numero), 0) from ${sql.identifier(tabla)}), nextval(pg_get_serial_sequence(${tabla}, 'numero')) - 1))`,
  );
}

/**
 * El administrador general de una empresa nueva, con usuario para entrar
 * (sin contraseña: la elige desde el mail de acceso o "¿Olvidaste tu
 * contraseña?"). `undefined` si el mail es de SOFTeam, que no puede
 * administrar clientes.
 */
export async function crearAdministradorGeneral(
  tx: Ejecutor,
  empresaId: string,
  administrador: Contacto & { email: string },
): Promise<UsuarioLogin | undefined> {
  const usuario = await asegurarUsuario(tx, administrador);
  if (usuario.rolSofteam) return undefined;
  await tx.insert(t.colaboradores).values({
    empresaId,
    nombre: administrador.nombre.slice(0, 120),
    email: normalizarEmail(administrador.email),
    telefono: administrador.telefono,
    adminGeneral: true,
    adminComercial: true,
    adminOperativo: true,
    usuarioId: usuario.id,
  });
  return usuario;
}
