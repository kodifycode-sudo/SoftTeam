import { and, eq, sql } from "drizzle-orm";
import { leerSiNo, normalizarTitulo } from "@/domain/importacion/csv";
import {
  leerCodigoOficina,
  leerCondicionIva,
  leerCuit,
  leerEntero,
  leerProvincia,
  leerTipoCliente,
  leerTipoInstalacion,
  leerTipoPersona,
} from "@/domain/importacion/valores";
import { TIPOS_SOCIEDAD } from "@/lib/argentina";
import type { Tx } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { crearAdministradorGeneral, crearCliente, crearEmpresa } from "../cuentas/creacion";
import { asegurarUsuario, type UsuarioLogin } from "../cuentas/usuarios";

/*
 * Qué se puede importar y cómo: columnas (con los nombres de la KB GeneXus y
 * nombres simples) y el alta de cada fila. Cada fila se procesa con su
 * propio punto de guardado; un `ErrorFila` la rechaza con un mensaje para el
 * usuario sin afectar a las demás.
 */

export class ErrorFila extends Error {}

export type Resultado = "creado" | "actualizado" | "existente";

export interface Contexto {
  paisId: string;
  /** Provincias activas del país. */
  provincias: readonly string[];
  /** Administradores con acceso nuevo (para enviarles el mail al final, si se pide). */
  invitaciones: UsuarioLogin[];
  /** Empresas con cambios (para avisar a los productos). */
  empresasTocadas: Set<string>;
}

export interface Columna {
  campo: string;
  titulo: string;
  alias: string[];
  requerida?: boolean;
  ayuda?: string;
}

export interface Definicion {
  etiqueta: string;
  descripcion: string;
  columnas: Columna[];
  procesar: (tx: Tx, fila: Fila, ctx: Contexto) => Promise<Resultado>;
}

/** Valores de una fila por campo (vacío si la columna no vino). */
export type Fila = Record<string, string>;

const col = (
  campo: string,
  titulo: string,
  alias: string[],
  opciones: { requerida?: boolean; ayuda?: string } = {},
): Columna => ({ campo, titulo, alias: [campo, titulo, ...alias], ...opciones });

// ─── Lectura de valores con mensajes claros ─────────────────────────────────

function requerido(fila: Fila, campo: string, nombre: string): string {
  const v = fila[campo]?.trim();
  if (!v) throw new ErrorFila(`Falta ${nombre}.`);
  return v;
}

function interpretar<T>(
  fila: Fila,
  campo: string,
  nombre: string,
  leer: (v: string) => T | undefined,
  porDefecto?: T,
): T {
  const v = fila[campo]?.trim() ?? "";
  if (!v && porDefecto !== undefined) return porDefecto;
  const valor = leer(v);
  if (valor === undefined) throw new ErrorFila(`${nombre}: "${v}" no es un valor válido.`);
  return valor;
}

const siNo = (fila: Fila, campo: string, porDefecto = false) =>
  fila[campo]?.trim() ? (leerSiNo(fila[campo]) ?? porDefecto) : porDefecto;

const texto = (fila: Fila, campo: string, max: number) => {
  const v = fila[campo]?.trim();
  return v ? v.slice(0, max) : null;
};

function email(fila: Fila, campo: string): string | null {
  const v = fila[campo]?.trim().toLowerCase();
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ErrorFila(`El mail "${v}" no es válido.`);
  return v;
}

// ─── Referencias ─────────────────────────────────────────────────────────────

async function empresaPorNumero(tx: Tx, fila: Fila) {
  const numero = interpretar(fila, "empresa", "Número de empresa", leerEntero);
  const empresa = await tx.query.empresas.findFirst({
    columns: { id: true, clienteId: true },
    where: eq(t.empresas.numero, numero),
  });
  if (!empresa)
    throw new ErrorFila(`No existe la empresa ${numero}. Importá primero los clientes.`);
  return empresa;
}

/** Oficina por código "CC-OOO", o por canal y oficina, o solo por número de oficina (si es única). */
async function oficinaPorCodigo(tx: Tx, empresaId: string, oficina: string, canal?: string) {
  const codigo = leerCodigoOficina(oficina, canal);
  const filas = await tx
    .select({ id: t.oficinas.id, canalId: t.oficinas.canalId, canal: t.canales.codigo })
    .from(t.oficinas)
    .innerJoin(t.canales, eq(t.canales.id, t.oficinas.canalId))
    .where(
      and(
        eq(t.oficinas.empresaId, empresaId),
        codigo
          ? and(eq(t.canales.codigo, codigo.canal), eq(t.oficinas.codigo, codigo.oficina))
          : eq(t.oficinas.codigo, oficina.trim().padStart(3, "0")),
      ),
    );
  if (filas.length === 0) throw new ErrorFila(`No existe la oficina ${oficina} en la empresa.`);
  if (filas.length > 1) {
    throw new ErrorFila(
      `Hay varias oficinas ${oficina}: indicá el canal (por ejemplo 01-${oficina}).`,
    );
  }
  return filas[0] as { id: string; canalId: string; canal: string };
}

/** Aseguradora por id anterior, abreviatura, código SSN o nombre. */
async function aseguradoraPor(tx: Tx, ctx: Contexto, valor: string) {
  const buscado = valor.trim();
  const fila = await tx.query.aseguradoras.findFirst({
    columns: { id: true },
    where: and(
      eq(t.aseguradoras.paisId, ctx.paisId),
      sql`(${t.aseguradoras.idAnterior} = ${buscado} or upper(${t.aseguradoras.abreviatura}) = upper(${buscado}) or ${t.aseguradoras.codigoLegal} = ${buscado} or lower(${t.aseguradoras.nombre}) = lower(${buscado}))`,
    ),
  });
  if (!fila)
    throw new ErrorFila(`No existe la aseguradora "${buscado}". Importá primero el catálogo.`);
  return fila;
}

/** Productor de la empresa por id anterior, CUIT o nombre. */
async function productorPor(tx: Tx, empresaId: string, valor: string) {
  const buscado = valor.trim();
  const cuit = leerCuit(buscado);
  const filas = await tx
    .select({
      id: t.productores.id,
      esOrganizador: t.productores.esOrganizador,
    })
    .from(t.productores)
    .where(
      and(
        eq(t.productores.empresaId, empresaId),
        sql`(${t.productores.idAnterior} = ${buscado} or ${t.productores.cuit} = ${cuit ?? "-"} or lower(${t.productores.nombre}) = lower(${buscado}))`,
      ),
    );
  if (filas.length === 0) throw new ErrorFila(`No existe el productor "${buscado}" en la empresa.`);
  if (filas.length > 1) throw new ErrorFila(`Hay varios productores "${buscado}": usá el CUIT.`);
  return filas[0] as { id: string; esOrganizador: boolean };
}

// ─── Clientes y empresas ─────────────────────────────────────────────────────

const clientes: Definicion = {
  etiqueta: "Clientes y empresas",
  descripcion:
    "Una fila por empresa, con los datos fiscales de su cliente. Si el CUIT ya existe, se usa ese cliente (no se modifica). El número de empresa se conserva: es el que usan los productos.",
  columnas: [
    col("cuit", "CUIT", ["STLicClienteFacCUIT", "clientecuit"], { requerida: true }),
    col("nombre", "Nombre o razón social", ["STLicClienteNom", "razonsocial"], {
      requerida: true,
    }),
    col("tipoPersona", "Tipo de persona", ["STLicClienteTipoper"], {
      ayuda: "F o J (humana o jurídica). Por defecto, jurídica.",
    }),
    col("tipoSociedad", "Tipo de sociedad", ["STLicClienteTipoSoc"], {
      ayuda: `${TIPOS_SOCIEDAD.join(", ")}.`,
    }),
    col("nombreFactura", "Nombre en la factura", ["STLicClienteFacNombre"]),
    col("condicionIva", "Condición de IVA", ["STLicClienteFacIVACod", "iva"], {
      requerida: true,
      ayuda: "RI, Monotributo, Exento, Consumidor final (o código AFIP 1, 6, 4, 5).",
    }),
    col("calle", "Domicilio fiscal", ["STLicClienteFacDomi", "domicilio", "direccion"], {
      requerida: true,
    }),
    col("ciudad", "Localidad", ["STLicClienteFacDomiCiu"], { requerida: true }),
    col("codigoPostal", "Código postal", ["STLicClienteFacDomiCP", "cp"], { requerida: true }),
    col("provincia", "Provincia", ["STLicClienteFacDomiPcia"], { requerida: true }),
    col("adminNombre", "Administrador", ["STLicClienteAdminNom"], { requerida: true }),
    col("adminEmail", "Mail del administrador", ["STLicClienteAdminMail"], { requerida: true }),
    col("adminTelefono", "Teléfono del administrador", ["STLicClienteAdminTel"]),
    col("pagosNombre", "Contacto de pagos", ["STLicClienteContactoPagoNom"]),
    col("pagosEmail", "Mail de pagos", ["STLicClienteContactoPagoMail"]),
    col("pagosTelefono", "Teléfono de pagos", ["STLicClienteContactoPagoTel"]),
    col("comercialNombre", "Contacto comercial", ["STLicClienteContacComNom"]),
    col("comercialEmail", "Mail comercial", ["STLicClienteContacComMail"]),
    col("comercialTelefono", "Teléfono comercial", ["STLicClienteContacComTel"]),
    col("xubio", "Código en Xubio", ["STLicClienteXubio", "xubioId"]),
    col("observaciones", "Observaciones", ["STLicClienteObservaciones"]),
    col("observacionFactura", "Observación en la factura", ["STLicClienteObsFactura"]),
    col("clienteBaja", "Cliente dado de baja", ["STLicClienteOff"], {
      ayuda: "Sí o No. Por defecto, activo.",
    }),
    col("clienteNumero", "Número de cliente", ["STLicClienteID"]),
    col("empresa", "Número de empresa", ["STLicEmpresaCod", "empresaNumero"], {
      ayuda: "Si no viene, se numera sola.",
    }),
    col("empresaNombre", "Nombre de la empresa", ["STLicEmpresaNom", "STLicClienteEmpresaNom"]),
    col("empresaNombreCorto", "Nombre corto", ["STLicEmpresaNomCto"]),
    col("tipoCliente", "Tipo de cliente", ["StLicEmpresasTipCliente"], {
      ayuda: "Directo o Corporativo.",
    }),
    col("instalacion", "Instalación", ["STLicEmpresaInstalacionTipo"], {
      ayuda: "SaaS u On-premise.",
    }),
    col("empresaBaja", "Empresa dada de baja", ["STLicEmpresaOff"]),
  ],
  async procesar(tx, fila, ctx) {
    const cuit = interpretar(fila, "cuit", "CUIT", leerCuit);
    const nombre = requerido(fila, "nombre", "el nombre o la razón social");
    const numeroEmpresa = fila.empresa?.trim()
      ? interpretar(fila, "empresa", "Número de empresa", leerEntero)
      : null;

    let resultado: Resultado = "existente";
    let cliente = await tx.query.clientes.findFirst({
      columns: { id: true },
      where: eq(t.clientes.cuit, cuit),
    });
    const administrador = {
      nombre: requerido(fila, "adminNombre", "el nombre del administrador"),
      email:
        email(fila, "adminEmail") ?? requerido(fila, "adminEmail", "el mail del administrador"),
      telefono: texto(fila, "adminTelefono", 30),
    };
    if (!cliente) {
      const tipoSociedad = texto(fila, "tipoSociedad", 10);
      const contacto = (prefijo: string) =>
        fila[`${prefijo}Nombre`]?.trim()
          ? {
              nombre: texto(fila, `${prefijo}Nombre`, 120) as string,
              email: email(fila, `${prefijo}Email`),
              telefono: texto(fila, `${prefijo}Telefono`, 30),
            }
          : null;
      cliente = await crearCliente(tx, {
        tipoPersona: interpretar(
          fila,
          "tipoPersona",
          "Tipo de persona",
          leerTipoPersona,
          "JURIDICA",
        ),
        nombre: nombre.slice(0, 120),
        tipoSociedad:
          TIPOS_SOCIEDAD.find(
            (s) => normalizarTitulo(s) === normalizarTitulo(tipoSociedad ?? ""),
          ) ?? null,
        nombreFactura: texto(fila, "nombreFactura", 120) ?? nombre.slice(0, 120),
        cuit,
        condicionIva: interpretar(fila, "condicionIva", "Condición de IVA", leerCondicionIva),
        domicilioFiscal: {
          calle: requerido(fila, "calle", "el domicilio fiscal").slice(0, 120),
          ciudad: requerido(fila, "ciudad", "la localidad").slice(0, 60),
          codigoPostal: requerido(fila, "codigoPostal", "el código postal").slice(0, 8),
          provincia: interpretar(fila, "provincia", "Provincia", (v) =>
            leerProvincia(v, ctx.provincias),
          ),
          paisId: ctx.paisId,
        },
        contactoAdministrador: administrador,
        contactoPagos: contacto("pagos"),
        contactoComercial: contacto("comercial"),
        xubioId: texto(fila, "xubio", 40),
        observaciones: texto(fila, "observaciones", 2000),
        observacionFactura: texto(fila, "observacionFactura", 200),
        activo: !siNo(fila, "clienteBaja"),
        numero: fila.clienteNumero?.trim()
          ? interpretar(fila, "clienteNumero", "Número de cliente", leerEntero)
          : null,
      });
      resultado = "creado";
    }

    if (numeroEmpresa) {
      const existente = await tx.query.empresas.findFirst({
        columns: { id: true, clienteId: true },
        where: eq(t.empresas.numero, numeroEmpresa),
      });
      if (existente && existente.clienteId !== cliente.id) {
        throw new ErrorFila(`La empresa ${numeroEmpresa} ya existe y es de otro cliente.`);
      }
      if (existente) return resultado;
    } else if (resultado === "existente") {
      // Cliente que ya estaba y sin número de empresa: no hay nada nuevo.
      return resultado;
    }

    const empresa = await crearEmpresa(tx, {
      clienteId: cliente.id,
      nombre: (texto(fila, "empresaNombre", 120) ?? nombre).slice(0, 120),
      nombreCorto: texto(fila, "empresaNombreCorto", 20) ?? undefined,
      tipoCliente: interpretar(fila, "tipoCliente", "Tipo de cliente", leerTipoCliente, "DIRECTO"),
      tipoInstalacion: interpretar(fila, "instalacion", "Instalación", leerTipoInstalacion, "SAAS"),
      activa: !siNo(fila, "empresaBaja"),
      paisId: ctx.paisId,
      numero: numeroEmpresa,
    });
    // El administrador del cliente administra la empresa: con usuario para entrar.
    const usuario = await crearAdministradorGeneral(tx, empresa.id, administrador);
    if (!usuario) {
      throw new ErrorFila(`El mail ${administrador.email} es de un usuario de SOFTeam.`);
    }
    ctx.invitaciones.push(usuario);
    ctx.empresasTocadas.add(empresa.id);
    return "creado";
  },
};

// ─── Oficinas ────────────────────────────────────────────────────────────────

const oficinas: Definicion = {
  etiqueta: "Canales y oficinas",
  descripcion:
    "Una fila por oficina. Crea el canal si no existe (o lo renombra si viene el nombre) y crea o actualiza la oficina.",
  columnas: [
    col("empresa", "Número de empresa", ["STLicEmpresaCod", "empresaNumero"], { requerida: true }),
    col("canal", "Canal", ["STLicCanal", "canalCodigo"], {
      requerida: true,
      ayuda: "Código de 2 dígitos (01).",
    }),
    col("canalNombre", "Nombre del canal", ["STLicCanalNom"]),
    col("oficina", "Oficina", ["STLicOficinaId", "oficinaCodigo"], {
      requerida: true,
      ayuda: "Código de 3 dígitos (001).",
    }),
    col("nombre", "Nombre de la oficina", ["STLicOficinaNom"], { requerida: true }),
    col("telefono", "Teléfono", ["STLicOficinaTel"]),
    col("whatsapp", "WhatsApp", ["STLicOficinaWhatsapp"]),
    col("domicilio", "Domicilio", ["STLicOficinaDomicilio"]),
    col("web", "Web", ["STLicOficinaWeb"]),
    col("facebook", "Facebook", ["STLicOficinaFacebook"]),
    col("instagram", "Instagram", ["STLicOficinaInstagtam", "STLicOficinaInstagram"]),
    col("linkedin", "LinkedIn", ["STLicOficinaLinkedin"]),
    col("baja", "Dada de baja", ["STLicOficinaOffSino"]),
  ],
  async procesar(tx, fila, ctx) {
    const empresa = await empresaPorNumero(tx, fila);
    const codigo = leerCodigoOficina(
      requerido(fila, "oficina", "la oficina"),
      requerido(fila, "canal", "el canal"),
    );
    if (!codigo)
      throw new ErrorFila("El canal (2 dígitos) o la oficina (3 dígitos) no son válidos.");
    const canalNombre = texto(fila, "canalNombre", 60);

    let canal = await tx.query.canales.findFirst({
      where: and(eq(t.canales.empresaId, empresa.id), eq(t.canales.codigo, codigo.canal)),
    });
    if (!canal) {
      [canal] = await tx
        .insert(t.canales)
        .values({
          empresaId: empresa.id,
          codigo: codigo.canal,
          nombre: canalNombre ?? `Canal ${codigo.canal}`,
        })
        .returning();
    } else if (canalNombre && canalNombre !== canal.nombre) {
      await tx.update(t.canales).set({ nombre: canalNombre }).where(eq(t.canales.id, canal.id));
    }
    if (!canal) throw new ErrorFila("No se pudo crear el canal.");

    const redes = Object.fromEntries(
      (["web", "facebook", "instagram", "linkedin"] as const)
        .map((r) => [r, texto(fila, r, 200)] as const)
        .filter(([, v]) => v),
    );
    const valores = {
      nombre: requerido(fila, "nombre", "el nombre de la oficina").slice(0, 80),
      telefono: texto(fila, "telefono", 30),
      whatsapp: texto(fila, "whatsapp", 30),
      domicilio: texto(fila, "domicilio", 160),
      redes: Object.keys(redes).length ? redes : null,
      activa: !siNo(fila, "baja"),
    };
    const existente = await tx.query.oficinas.findFirst({
      columns: { id: true },
      where: and(eq(t.oficinas.canalId, canal.id), eq(t.oficinas.codigo, codigo.oficina)),
    });
    ctx.empresasTocadas.add(empresa.id);
    if (existente) {
      await tx.update(t.oficinas).set(valores).where(eq(t.oficinas.id, existente.id));
      return "actualizado";
    }
    await tx.insert(t.oficinas).values({
      empresaId: empresa.id,
      canalId: canal.id,
      codigo: codigo.oficina,
      ...valores,
    });
    return "creado";
  },
};

// ─── Usuarios de las empresas ────────────────────────────────────────────────

const usuarios: Definicion = {
  etiqueta: "Usuarios de las empresas",
  descripcion:
    "Una fila por usuario. Si el mail ya está en la empresa, no se modifica. No se controlan los límites de la licencia: si sobran usuarios, el proceso diario avisa.",
  columnas: [
    col("empresa", "Número de empresa", ["StLicUsuarioEmpresa", "STLicEmpresaCod"], {
      requerida: true,
    }),
    col("nombre", "Nombre", ["StLicUsuarioNom"], { requerida: true }),
    col("email", "Mail", ["StLicUsuarioMail"], { requerida: true }),
    col("iniciales", "Iniciales", ["StLicUsuarioNomIniciales"]),
    col("oficina", "Oficina", ["StLicUsuarioOficina"], {
      ayuda: "01-002, o el número de oficina si es único. Vacío: toda la empresa.",
    }),
    col("adminGeneral", "Administrador general", ["StLicUsuarioAdministradorGeneralSino"]),
    col("adminComercial", "Administrador comercial", ["UsuarioAdministradorComercialSIno"]),
    col("adminOperativo", "Administrador operativo", ["UsuarioAdministradorOperativoSIno"]),
    col("prodigal", "Acceso a Prodigal", ["UsuarioAccesoProdigalSino"]),
    col("cotiweb", "Acceso a CotiWeb", ["UsuarioAccesoCWSino"]),
    col("bienseguro", "Acceso a BienSeguro", ["UsuarioAccesoBSSino"]),
    col("boletin", "Acceso al Boletín", ["UsuarioAccesoContactoSino"]),
    col("usuarioProdigal", "Usuario en Prodigal", ["UsuarioProdigal"]),
    col("baja", "Dado de baja", ["StLicUsuarioOffSino"]),
  ],
  async procesar(tx, fila, ctx) {
    const empresa = await empresaPorNumero(tx, fila);
    const correo = email(fila, "email") ?? requerido(fila, "email", "el mail");
    const existente = await tx.query.colaboradores.findFirst({
      columns: { id: true },
      where: and(
        eq(t.colaboradores.empresaId, empresa.id),
        sql`lower(${t.colaboradores.email}) = ${correo}`,
      ),
    });
    if (existente) return "existente";

    const oficina = fila.oficina?.trim()
      ? await oficinaPorCodigo(tx, empresa.id, fila.oficina)
      : null;
    const usuarioProdigal = texto(fila, "usuarioProdigal", 20)?.toUpperCase() ?? null;
    if (usuarioProdigal) {
      const ocupado = await tx.query.colaboradores.findFirst({
        columns: { id: true },
        where: eq(t.colaboradores.usuarioProdigal, usuarioProdigal),
      });
      if (ocupado) throw new ErrorFila(`El usuario de Prodigal ${usuarioProdigal} ya está en uso.`);
    }
    const nombre = requerido(fila, "nombre", "el nombre").slice(0, 120);
    const permisos = {
      adminGeneral: siNo(fila, "adminGeneral"),
      adminComercial: siNo(fila, "adminComercial"),
      adminOperativo: siNo(fila, "adminOperativo"),
    };
    const activo = !siNo(fila, "baja");
    const administra =
      activo && (permisos.adminGeneral || permisos.adminComercial || permisos.adminOperativo);
    let usuarioId: string | null = null;
    if (administra) {
      const usuario = await asegurarUsuario(tx, { email: correo, nombre });
      if (usuario.rolSofteam) throw new ErrorFila(`El mail ${correo} es de un usuario de SOFTeam.`);
      usuarioId = usuario.id;
      ctx.invitaciones.push(usuario);
    }
    await tx.insert(t.colaboradores).values({
      empresaId: empresa.id,
      nombre,
      iniciales: texto(fila, "iniciales", 5),
      email: correo,
      // El administrador general ve toda la empresa.
      canalId: permisos.adminGeneral ? null : (oficina?.canalId ?? null),
      oficinaId: permisos.adminGeneral ? null : (oficina?.id ?? null),
      ...permisos,
      accesoProdigal: siNo(fila, "prodigal"),
      accesoCotiweb: siNo(fila, "cotiweb"),
      accesoBienseguro: siNo(fila, "bienseguro"),
      accesoBoletin: siNo(fila, "boletin"),
      usuarioProdigal,
      usuarioId,
      activo,
    });
    ctx.empresasTocadas.add(empresa.id);
    return "creado";
  },
};

// ─── Productores ─────────────────────────────────────────────────────────────

const productores: Definicion = {
  etiqueta: "Productores",
  descripcion:
    "Una fila por productor. Se reconoce por su id anterior o su CUIT: si ya está en la empresa, no se modifica.",
  columnas: [
    col("empresa", "Número de empresa", ["STLicEmpresaCod", "empresaNumero"], { requerida: true }),
    col("idAnterior", "Id del productor", ["STLicProductorId"], {
      ayuda: "El id del sistema anterior: lo usan los códigos por compañía.",
    }),
    col("nombre", "Nombre", ["STLicProductorNom"], { requerida: true }),
    col("matricula", "Matrícula", ["STLicProductorMatriculaSSN"]),
    col("tipoPersona", "Tipo de persona", ["STLicProductorTipoPers"]),
    col("cuit", "CUIT", ["STLicProductorCUIT"]),
    col("condicionIva", "Condición de IVA", ["STLicProductorIVA"]),
    col("email", "Mail", ["STLicProductorMail"]),
    col("telefono", "Teléfono", ["STLicProductorTelefono"]),
    col("celular", "Celular", ["STLicProductorCelular"]),
    col("domicilio", "Domicilio", ["STLicProducotrDomicilio", "STLicProductorDomicilio"]),
    col("localidad", "Localidad", ["STLicProdictorLocalidad", "STLicProductorLocalidad"]),
    col("provincia", "Provincia", ["STLicProductorPcia"]),
    col("oficina", "Oficina", ["STLicProductorOficina"]),
    col("institorio", "Agente institorio", ["STLicProductorAgenteInstitorioSIno"]),
    col("productor", "Es productor", ["STLicProductorRolProdSino"]),
    col("organizador", "Es organizador", ["STLicProductorRolOrgSino"]),
    col("subproductor", "Es subproductor", ["STLicProductorRolSubProdSino"]),
    col("baja", "Dado de baja", ["STLicProductorOffSino"]),
  ],
  async procesar(tx, fila, ctx) {
    const empresa = await empresaPorNumero(tx, fila);
    const idAnterior = texto(fila, "idAnterior", 20);
    const cuit = fila.cuit?.trim() ? interpretar(fila, "cuit", "CUIT", leerCuit) : null;
    if (idAnterior || cuit) {
      const existente = await tx.query.productores.findFirst({
        columns: { id: true },
        where: and(
          eq(t.productores.empresaId, empresa.id),
          sql`(${t.productores.idAnterior} = ${idAnterior ?? "-"} or ${t.productores.cuit} = ${cuit ?? "-"})`,
        ),
      });
      if (existente) return "existente";
    }
    const oficina = fila.oficina?.trim()
      ? await oficinaPorCodigo(tx, empresa.id, fila.oficina)
      : null;
    const roles = {
      esProductor: siNo(fila, "productor", true),
      esOrganizador: siNo(fila, "organizador"),
      esSubproductor: siNo(fila, "subproductor"),
    };
    if (!roles.esProductor && !roles.esOrganizador && !roles.esSubproductor)
      roles.esProductor = true;
    const domicilio = [
      texto(fila, "domicilio", 120),
      texto(fila, "localidad", 60),
      texto(fila, "provincia", 40),
    ]
      .filter(Boolean)
      .join(", ");
    await tx.insert(t.productores).values({
      empresaId: empresa.id,
      oficinaId: oficina?.id ?? null,
      idAnterior,
      nombre: requerido(fila, "nombre", "el nombre").slice(0, 120),
      matricula: texto(fila, "matricula", 20),
      tipoPersona: fila.tipoPersona?.trim()
        ? interpretar(fila, "tipoPersona", "Tipo de persona", leerTipoPersona)
        : null,
      cuit,
      condicionIva: fila.condicionIva?.trim()
        ? interpretar(fila, "condicionIva", "Condición de IVA", leerCondicionIva)
        : null,
      email: email(fila, "email"),
      telefono: texto(fila, "telefono", 30),
      celular: texto(fila, "celular", 30),
      domicilio: domicilio ? domicilio.slice(0, 160) : null,
      agenteInstitorio: siNo(fila, "institorio"),
      ...roles,
      activo: !siNo(fila, "baja"),
    });
    ctx.empresasTocadas.add(empresa.id);
    return "creado";
  },
};

// ─── Códigos por compañía ────────────────────────────────────────────────────

const codigos: Definicion = {
  etiqueta: "Códigos de productor por compañía",
  descripcion:
    "Una fila por código. Marca que la empresa trabaja con la aseguradora si todavía no lo hacía.",
  columnas: [
    col("empresa", "Número de empresa", ["STLicEmpresaCod", "empresaNumero"], { requerida: true }),
    col("productor", "Productor", ["STLicProductorId"], {
      requerida: true,
      ayuda: "Id anterior, CUIT o nombre del productor.",
    }),
    col(
      "aseguradora",
      "Aseguradora",
      ["STLicProductorAsegruadoraId", "STLicProductorAseguradoraId"],
      {
        requerida: true,
        ayuda: "Id anterior, abreviatura, código SSN o nombre.",
      },
    ),
    col("codigo", "Código", ["STLicProductorxCia"], { requerida: true }),
    col("organizador", "Como organizador", ["STLicProductorRolOrgxCiaSino"], {
      ayuda: "Sí: el código es de organizador. Por defecto, de productor.",
    }),
    col("baja", "Dado de baja", ["STLicProductorCiaOff"]),
  ],
  async procesar(tx, fila, ctx) {
    const empresa = await empresaPorNumero(tx, fila);
    const productor = await productorPor(
      tx,
      empresa.id,
      requerido(fila, "productor", "el productor"),
    );
    const aseguradora = await aseguradoraPor(
      tx,
      ctx,
      requerido(fila, "aseguradora", "la aseguradora"),
    );
    const codigo = requerido(fila, "codigo", "el código").toUpperCase().slice(0, 20);
    const rol = siNo(fila, "organizador") ? "ORGANIZADOR" : "PRODUCTOR";
    if (rol === "ORGANIZADOR" && !productor.esOrganizador) {
      await tx
        .update(t.productores)
        .set({ esOrganizador: true })
        .where(eq(t.productores.id, productor.id));
    }
    await tx
      .insert(t.empresaAseguradoras)
      .values({ empresaId: empresa.id, aseguradoraId: aseguradora.id, activa: true })
      .onConflictDoUpdate({
        target: [t.empresaAseguradoras.empresaId, t.empresaAseguradoras.aseguradoraId],
        set: { activa: true },
      });
    const creado = await tx
      .insert(t.productorCodigos)
      .values({
        productorId: productor.id,
        aseguradoraId: aseguradora.id,
        codigo,
        rol,
        activo: !siNo(fila, "baja"),
      })
      .onConflictDoNothing()
      .returning({ id: t.productorCodigos.id });
    ctx.empresasTocadas.add(empresa.id);
    return creado.length ? "creado" : "existente";
  },
};

// ─── Aseguradoras ────────────────────────────────────────────────────────────

const aseguradoras: Definicion = {
  etiqueta: "Catálogo de aseguradoras",
  descripcion:
    "Una fila por aseguradora. Se reconoce por el id anterior o la abreviatura: si existe, se actualiza.",
  columnas: [
    col("idAnterior", "Id de la aseguradora", ["AseguradoraId"]),
    col("nombre", "Nombre", ["AseguradoraNom"], { requerida: true }),
    col("abreviatura", "Abreviatura", ["AseguradoraAbrev"], { requerida: true }),
    col("codigoLegal", "Código SSN", ["AseguradoraLegalId"]),
    col("prodigal", "Interfaz con Prodigal", ["AseguradoraInterfaseProdiCarteraSino"]),
    col("cotiweb", "Interfaz con CotiWeb", ["AseguradoraInterfaseCWSino"]),
    col("documentos", "Interfaz de documentos", ["AseguradoraInterfaseDocumentosSino"]),
    col("baja", "Discontinuada", ["AseguradoraOffSino"]),
  ],
  async procesar(tx, fila, ctx) {
    const idAnterior = texto(fila, "idAnterior", 20);
    const abreviatura = requerido(fila, "abreviatura", "la abreviatura")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10);
    if (abreviatura.length < 2) throw new ErrorFila("La abreviatura necesita 2 letras o números.");
    const codigoLegal = texto(fila, "codigoLegal", 10);
    const valores = {
      nombre: requerido(fila, "nombre", "el nombre").slice(0, 80),
      abreviatura,
      codigoLegal: codigoLegal && /^\d+$/.test(codigoLegal) ? codigoLegal : null,
      idAnterior,
      interfazProdigalDisponible: siNo(fila, "prodigal"),
      interfazCotiwebDisponible: siNo(fila, "cotiweb"),
      interfazDocumentosDisponible: siNo(fila, "documentos"),
      activa: !siNo(fila, "baja"),
    };
    const existente = await tx.query.aseguradoras.findFirst({
      columns: { id: true },
      where: and(
        eq(t.aseguradoras.paisId, ctx.paisId),
        sql`(${t.aseguradoras.idAnterior} = ${idAnterior ?? "-"} or ${t.aseguradoras.abreviatura} = ${abreviatura})`,
      ),
    });
    if (existente) {
      await tx.update(t.aseguradoras).set(valores).where(eq(t.aseguradoras.id, existente.id));
      return "actualizado";
    }
    await tx.insert(t.aseguradoras).values({ paisId: ctx.paisId, ...valores });
    return "creado";
  },
};

// ─── Aseguradoras de cada empresa ────────────────────────────────────────────

const empresaAseguradoras: Definicion = {
  etiqueta: "Aseguradoras de cada empresa",
  descripcion:
    "Una fila por empresa y aseguradora con la que trabaja, con sus interfaces. No se controlan los límites de la licencia.",
  columnas: [
    col("empresa", "Número de empresa", ["STLicEmpresaCod", "empresaNumero"], { requerida: true }),
    col("aseguradora", "Aseguradora", ["STLicAseguradorasId", "STLicAseguradorasAbrev"], {
      requerida: true,
      ayuda: "Id anterior, abreviatura, código SSN o nombre.",
    }),
    col("prodigal", "Interfaz con Prodigal", ["STLicAseguradoraInterfaseProdiCarteraSino"]),
    col("cotiweb", "Interfaz con CotiWeb", [
      "STLicAseguradoraInterfaseCWSino",
      "STLicAseguradorasInterfaseCWSino",
    ]),
  ],
  async procesar(tx, fila, ctx) {
    const empresa = await empresaPorNumero(tx, fila);
    const aseguradora = await aseguradoraPor(
      tx,
      ctx,
      requerido(fila, "aseguradora", "la aseguradora"),
    );
    const valores = {
      activa: true,
      interfazProdigal: siNo(fila, "prodigal"),
      interfazCotiweb: siNo(fila, "cotiweb"),
      interfazProdigalBajaDesde: null,
      interfazCotiwebBajaDesde: null,
    };
    const [fila2] = await tx
      .insert(t.empresaAseguradoras)
      .values({ empresaId: empresa.id, aseguradoraId: aseguradora.id, ...valores })
      .onConflictDoUpdate({
        target: [t.empresaAseguradoras.empresaId, t.empresaAseguradoras.aseguradoraId],
        set: valores,
      })
      .returning({ nuevo: sql<boolean>`xmax = 0` });
    ctx.empresasTocadas.add(empresa.id);
    return fila2?.nuevo ? "creado" : "actualizado";
  },
};

export const DEFINICIONES = {
  clientes,
  oficinas,
  usuarios,
  productores,
  aseguradoras,
  codigos,
  empresaAseguradoras,
} satisfies Record<string, Definicion>;

export type TipoImportacion = keyof typeof DEFINICIONES;

/** Orden sugerido: cada tipo necesita que existan los anteriores. */
export const ORDEN_IMPORTACION: TipoImportacion[] = [
  "aseguradoras",
  "clientes",
  "oficinas",
  "usuarios",
  "productores",
  "codigos",
  "empresaAseguradoras",
];
