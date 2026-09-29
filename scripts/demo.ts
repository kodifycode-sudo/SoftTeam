/*
 * Datos de demostración para ver STLic en ejecución: usuarios de prueba de
 * cada perfil, varios clientes y empresas con oficinas, usuarios,
 * productores, aseguradoras, compras pagas y pendientes, consumos, pedidos de
 * soporte, un grupo económico y avisos.
 *
 * Se carga con las mismas reglas del sistema (altas, carrito, pagos,
 * consumos), así los datos son coherentes. Solo para desarrollo:
 *
 *   npm run db:demo            (con el servidor de desarrollo detenido)
 *
 * No hace nada si ya se cargó (lo reconoce por el usuario de Comercial).
 */
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { TODA_LA_EMPRESA } from "../src/domain/cuentas/alcance";
import { type Fecha, hoy as hoyArgentina, sumarDias } from "../src/domain/fecha";
import { crearDbPglite, type Db } from "../src/server/db/cliente";
import * as t from "../src/server/db/schema";
import { sembrarDatosBase } from "../src/server/db/semilla";
import { cambiarAseguradora } from "../src/server/modules/configuracion/aseguradoras";
import {
  type Actor,
  esquemaColaborador,
  guardarColaborador,
} from "../src/server/modules/configuracion/colaboradores";
import {
  esquemaTipoComunicacion,
  guardarTipoComunicacion,
} from "../src/server/modules/configuracion/comunicaciones";
import { esquemaMarca, guardarMarca } from "../src/server/modules/configuracion/marca";
import {
  agregarCodigo,
  esquemaProductor,
  guardarProductor,
} from "../src/server/modules/configuracion/productores";
import { consumir } from "../src/server/modules/consumos/consumir";
import {
  altaClientePorSofteam,
  esquemaAltaCliente,
} from "../src/server/modules/cuentas/altas-softeam";
import { agregarAlGrupo, esquemaGrupo, guardarGrupo } from "../src/server/modules/cuentas/grupos";
import { crearOficina, listarOficinas } from "../src/server/modules/cuentas/oficinas";
import { vincularColaboradores } from "../src/server/modules/cuentas/usuarios";
import { procesoDiario } from "../src/server/modules/procesos/diario";
import { abrirIncidente, responderIncidente } from "../src/server/modules/soporte/incidentes";
import { agregarAlCarrito } from "../src/server/modules/ventas/carrito";
import { confirmarOrden } from "../src/server/modules/ventas/checkout";
import { registrarPago } from "../src/server/modules/ventas/ordenes";

/** Contraseña de todos los usuarios de prueba. */
export const CONTRASENA_DEMO = "Demo.STLic2026";

const HOY: Fecha = hoyArgentina();

function exigir<T extends { ok: boolean }>(r: T, que: string): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`${que}: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

/** Usuario con contraseña y mail verificado (los de prueba no pasan por el mail). */
async function darAcceso(
  db: Db,
  email: string,
  nombre: string,
  rolSofteam?: "COMERCIAL" | "SOPORTE" | "ADMINISTRACION",
) {
  let usuario = await db.query.usuarios.findFirst({ where: eq(t.usuarios.email, email) });
  if (!usuario) {
    [usuario] = await db
      .insert(t.usuarios)
      .values({ id: crypto.randomUUID(), name: nombre, email, emailVerified: true, rolSofteam })
      .returning();
  }
  if (!usuario) throw new Error(`No se creó ${email}`);
  await db.update(t.usuarios).set({ emailVerified: true }).where(eq(t.usuarios.id, usuario.id));
  const cuenta = await db.query.cuentasAuth.findFirst({
    where: and(eq(t.cuentasAuth.userId, usuario.id), eq(t.cuentasAuth.providerId, "credential")),
  });
  // Un usuario que ya tenía contraseña (el administrador inicial) la conserva.
  if (!cuenta) {
    await db.insert(t.cuentasAuth).values({
      id: crypto.randomUUID(),
      accountId: usuario.id,
      providerId: "credential",
      userId: usuario.id,
      password: await hashPassword(CONTRASENA_DEMO),
    });
  }
  await vincularColaboradores(db, usuario.id, email);
  return usuario.id;
}

async function alternativa(db: Db, codigo: string, nombre: string) {
  const [fila] = await db
    .select({ id: t.alternativas.id })
    .from(t.alternativas)
    .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
    .where(and(eq(t.paquetes.codigo, codigo), eq(t.alternativas.nombre, nombre)));
  if (!fila) throw new Error(`No existe ${codigo} ${nombre}`);
  return fila.id;
}

async function medio(db: Db, codigo: string) {
  const m = await db.query.mediosPago.findFirst({ where: eq(t.mediosPago.codigo, codigo) });
  if (!m) throw new Error(`No existe el medio ${codigo}`);
  return m.id;
}

/** Compra paquetes (carrito + confirmación) y, si se pide, registra el pago. */
async function comprar(
  db: Db,
  empresaId: string,
  usuarioId: string,
  items: [codigo: string, alternativa: string, cantidad: number][],
  opciones: { medio: string; pagar?: { actorId: string; dias?: number } | false; dias?: number },
) {
  const fecha = sumarDias(HOY, -(opciones.dias ?? 0));
  for (const [codigo, nombre, cantidad] of items) {
    exigir(
      await agregarAlCarrito(
        db,
        { empresaId, alternativaId: await alternativa(db, codigo, nombre), cantidad, usuarioId },
        fecha,
      ),
      `carrito ${codigo}`,
    );
  }
  const orden = exigir(
    await confirmarOrden(
      db,
      {
        empresaId,
        usuarioId,
        medioPagoId: await medio(db, opciones.medio),
        claveIdempotencia: crypto.randomUUID(),
      },
      fecha,
    ),
    "confirmar orden",
  ).valor;
  if (opciones.pagar) {
    await registrarPago(
      db,
      orden.ordenId,
      opciones.pagar.actorId,
      sumarDias(HOY, -(opciones.pagar.dias ?? opciones.dias ?? 0)),
    );
  }
  return orden;
}

interface Cliente {
  clienteId: string;
  empresaId: string;
  empresaNumero: number;
  adminUsuarioId: string;
  actor: Actor;
}

async function nuevoCliente(
  db: Db,
  datos: Record<string, unknown>,
  softeamId: string,
): Promise<Cliente> {
  const entrada = esquemaAltaCliente.parse(datos);
  const r = await altaClientePorSofteam(db, entrada, softeamId);
  if (!r.ok) throw new Error(`alta ${entrada.nombre}: ${r.error}`);
  const adminUsuarioId = await darAcceso(
    db,
    entrada.administrador.email,
    entrada.administrador.nombre,
  );
  const empresa = await db.query.empresas.findFirst({ where: eq(t.empresas.id, r.empresaId) });
  const colaborador = await db.query.colaboradores.findFirst({
    where: and(
      eq(t.colaboradores.empresaId, r.empresaId),
      eq(t.colaboradores.usuarioId, adminUsuarioId),
    ),
  });
  if (!empresa || !colaborador)
    throw new Error(`alta ${entrada.nombre}: sin empresa o administrador`);
  return {
    clienteId: r.clienteId,
    empresaId: r.empresaId,
    empresaNumero: empresa.numero,
    adminUsuarioId,
    actor: {
      usuarioId: adminUsuarioId,
      colaboradorId: colaborador.id,
      adminGeneral: true,
      adminComercial: true,
      adminOperativo: true,
      alcance: TODA_LA_EMPRESA,
    },
  };
}

const SIN_ACCESOS = {
  adminGeneral: false,
  adminComercial: false,
  adminOperativo: false,
  accesoProdigal: false,
  accesoCotiweb: false,
  accesoBienseguro: false,
  accesoBoletin: false,
};

async function usuario(
  db: Db,
  c: Cliente,
  datos: { nombre: string; email: string; alcance?: string } & Partial<typeof SIN_ACCESOS>,
  conAcceso = true,
) {
  const entrada = esquemaColaborador.parse({ alcance: "empresa", ...SIN_ACCESOS, ...datos });
  exigir(
    await guardarColaborador(db, c.empresaId, entrada, c.actor, HOY),
    `usuario ${datos.email}`,
  );
  if (conAcceso) await darAcceso(db, datos.email, datos.nombre);
}

async function aseguradoras(db: Db, c: Cliente, abreviaturas: string[], interfaces: boolean) {
  for (const abreviatura of abreviaturas) {
    const a = await db.query.aseguradoras.findFirst({
      where: eq(t.aseguradoras.abreviatura, abreviatura),
    });
    if (!a) continue;
    exigir(
      await cambiarAseguradora(
        db,
        c.empresaId,
        { aseguradoraId: a.id, cambio: "trabaja", valor: true },
        c.adminUsuarioId,
        HOY,
      ),
      `aseguradora ${abreviatura}`,
    );
    if (interfaces && a.interfazProdigalDisponible) {
      await cambiarAseguradora(
        db,
        c.empresaId,
        { aseguradoraId: a.id, cambio: "prodigal", valor: true },
        c.adminUsuarioId,
        HOY,
      );
    }
  }
}

async function productor(
  db: Db,
  c: Cliente,
  datos: Record<string, unknown>,
  codigos: [abreviatura: string, codigo: string][],
) {
  const entrada = esquemaProductor.parse({
    esProductor: true,
    esOrganizador: false,
    esSubproductor: false,
    agenteInstitorio: false,
    ...datos,
  });
  const { id } = exigir(
    await guardarProductor(db, c.empresaId, entrada, c.adminUsuarioId, HOY),
    `productor ${entrada.nombre}`,
  );
  for (const [abreviatura, codigo] of codigos) {
    const a = await db.query.aseguradoras.findFirst({
      where: eq(t.aseguradoras.abreviatura, abreviatura),
    });
    if (!a) continue;
    exigir(
      await agregarCodigo(
        db,
        c.empresaId,
        { productorId: id, aseguradoraId: a.id, codigo, rol: "PRODUCTOR" },
        c.adminUsuarioId,
      ),
      `código ${codigo}`,
    );
  }
}

async function principal() {
  const db = await crearDbPglite(".data/pglite");
  await sembrarDatosBase(db, { demo: true });
  if (
    await db.query.usuarios.findFirst({ where: eq(t.usuarios.email, "comercial@softeam.local") })
  ) {
    console.info("[demo] los datos de demostración ya estaban cargados.");
    return;
  }
  console.info("[demo] cargando…");

  // ─── SOFTeam: un usuario por rol ──────────────────────────────────────────
  const adminId = await darAcceso(
    db,
    "admin@softeam.local",
    "Administración SOFTeam",
    "ADMINISTRACION",
  );
  await darAcceso(db, "comercial@softeam.local", "Lucía Comercial", "COMERCIAL");
  const soporteId = await darAcceso(db, "soporte@softeam.local", "Martín Soporte", "SOPORTE");

  // ─── 1. Broker del Sur: la empresa completa, con delegados ───────────────
  const sur = await nuevoCliente(
    db,
    {
      tipoPersona: "JURIDICA",
      nombre: "Broker del Sur SA",
      tipoSociedad: "SA",
      cuit: "30-71234567-1",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "Av. Corrientes 1234, piso 5",
        ciudad: "Ciudad de Buenos Aires",
        codigoPostal: "C1043",
        provincia: "Ciudad Autónoma de Buenos Aires",
      },
      administrador: {
        nombre: "Ana Pérez",
        email: "ana@brokerdelsur.demo",
        telefono: "011 4555-1000",
      },
      empresa: { nombre: "Broker del Sur", tipoCliente: "DIRECTO", tipoInstalacion: "SAAS" },
    },
    adminId,
  );
  await comprar(
    db,
    sur.empresaId,
    sur.adminUsuarioId,
    [
      ["PRO-FULL", "Anual", 1],
      ["CW-PRO", "Mensual", 1],
      ["BS-BASE", "Mensual", 1],
      ["NOTI-10K", "Pago único", 2],
      ["SOPORTE-10", "Pago único", 1],
    ],
    { medio: "TRANSF", pagar: { actorId: adminId }, dias: 20 },
  );
  // Oficinas: Casa central ya existe (01-001); se suman Palermo y el canal Interior.
  const [central] = await listarOficinas(db, sur.empresaId);
  if (!central) throw new Error("Sin casa central");
  exigir(
    await crearOficina(
      db,
      sur.empresaId,
      { nombre: "Palermo", canalId: central.canalId, telefono: "011 4777-2000" },
      sur.adminUsuarioId,
    ),
    "oficina Palermo",
  );
  exigir(
    await crearOficina(
      db,
      sur.empresaId,
      { nombre: "Rosario", canalNuevo: "Interior", telefono: "0341 421-3000" },
      sur.adminUsuarioId,
    ),
    "oficina Rosario",
  );
  const interior = (await listarOficinas(db, sur.empresaId)).find((o) => o.nombre === "Rosario");
  if (!interior) throw new Error("Sin Rosario");
  exigir(
    await crearOficina(
      db,
      sur.empresaId,
      { nombre: "Córdoba", canalId: interior.canalId },
      sur.adminUsuarioId,
    ),
    "oficina Córdoba",
  );

  await usuario(db, sur, {
    nombre: "Bruno Comercial",
    email: "bruno@brokerdelsur.demo",
    adminComercial: true,
    accesoProdigal: true,
  });
  await usuario(db, sur, {
    nombre: "Carla Operaciones",
    email: "carla@brokerdelsur.demo",
    adminOperativo: true,
    accesoProdigal: true,
    accesoCotiweb: true,
  });
  await usuario(db, sur, {
    nombre: "Diego Interior",
    email: "diego@brokerdelsur.demo",
    alcance: `canal:${interior.canalId}`,
    adminComercial: true,
    adminOperativo: true,
    accesoProdigal: true,
  });
  await usuario(db, sur, {
    nombre: "Elena Rosario",
    email: "elena@brokerdelsur.demo",
    alcance: `oficina:${interior.id}`,
    adminOperativo: true,
    accesoProdigal: true,
  });
  await usuario(
    db,
    sur,
    {
      nombre: "Federico Vendedor",
      email: "federico@brokerdelsur.demo",
      alcance: `oficina:${central.id}`,
      accesoProdigal: true,
      accesoCotiweb: true,
    },
    false,
  );

  await aseguradoras(db, sur, ["SEGUNDA", "SANCOR", "FEDPAT", "ALLIANZ", "SANCRIS"], true);
  await productor(
    db,
    sur,
    {
      nombre: "Gómez, Laura",
      tipoPersona: "FISICA",
      cuit: "27-28123456-6",
      condicionIva: "MONOTRIBUTO",
      email: "laura.gomez@mail.demo",
      matricula: "65432",
    },
    [
      ["SEGUNDA", "LS-1020"],
      ["SANCOR", "SC-88731"],
    ],
  );
  await productor(
    db,
    sur,
    {
      nombre: "Ruiz, Pablo",
      tipoPersona: "FISICA",
      cuit: "20-30111222-0",
      condicionIva: "MONOTRIBUTO",
      oficinaId: interior.id,
      esOrganizador: true,
    },
    [["FEDPAT", "FP-5501"]],
  );
  await productor(
    db,
    sur,
    {
      nombre: "Seguros Norte SRL",
      tipoPersona: "JURIDICA",
      cuit: "30-70999888-5",
      condicionIva: "RESPONSABLE_INSCRIPTO",
    },
    [["ALLIANZ", "AZ-300"]],
  );

  // Consumos de toda la empresa (primero el cupo del mes, después el saldo)…
  const deLaEmpresa = [
    ["notificaciones", "mail", 1500, "boletin", "Boletín mensual de novedades"],
    ["notificaciones", "whatsapp", 300, "bienseguro", "Recordatorio de pago de cuota"],
    ["cotizaciones", undefined, 480, "cotiweb", undefined],
    ["cotizaciones", undefined, 350, "prodigal", undefined],
  ] as const;
  for (const [n, [familia, medioEnvio, cantidad, sistema, concepto]] of deLaEmpresa.entries()) {
    await consumir(
      db,
      {
        sistema,
        empresaNumero: sur.empresaNumero,
        familia,
        cantidad,
        medio: medioEnvio,
        modo: "PARCIAL",
        transaccion: `demo-empresa-${n}`,
        concepto,
      },
      HOY,
    );
  }
  // …y de cada oficina, dentro del tope mensual que la política les fija.
  const oficinas = await listarOficinas(db, sur.empresaId);
  for (const [i, o] of oficinas.entries()) {
    for (const [medioEnvio, cantidad] of [
      ["mail", 120],
      ["whatsapp", 30],
      ["sms", 15],
    ] as const) {
      await consumir(
        db,
        {
          sistema: "bienseguro",
          empresaNumero: sur.empresaNumero,
          familia: "notificaciones",
          cantidad: cantidad + i * 10,
          medio: medioEnvio,
          oficina: `${o.canalCodigo}${o.codigo}`,
          modo: "PARCIAL",
          transaccion: `demo-${o.id}-${medioEnvio}`,
          concepto: "Aviso de vencimiento de pólizas",
        },
        HOY,
      );
    }
    await consumir(
      db,
      {
        sistema: "cotiweb",
        empresaNumero: sur.empresaNumero,
        familia: "cotizaciones",
        cantidad: 40 + i * 15,
        oficina: `${o.canalCodigo}${o.codigo}`,
        modo: "PARCIAL",
        transaccion: `demo-cot-${o.id}`,
      },
      HOY,
    );
  }

  // Soporte: un pedido respondido y otro abierto.
  const ctxSur = {
    empresaId: sur.empresaId,
    empresaNumero: sur.empresaNumero,
    usuarioId: sur.adminUsuarioId,
  };
  const p1 = exigir(
    await abrirIncidente(
      db,
      ctxSur,
      {
        producto: "prodigal",
        asunto: "No sincroniza la cartera de La Segunda",
        prioridad: "ALTA",
        texto:
          "Desde ayer la interfaz de La Segunda no trae las pólizas nuevas. El resto de las compañías funciona bien.",
      },
      HOY,
    ),
    "pedido 1",
  );
  await responderIncidente(
    db,
    p1.id,
    { usuarioId: soporteId, softeam: true },
    {
      texto:
        "La compañía cambió el certificado del servicio. Ya lo actualizamos: probá sincronizar de nuevo.",
    },
  );
  await responderIncidente(
    db,
    p1.id,
    { usuarioId: soporteId, softeam: true },
    {
      texto: "Revisado con el proveedor: el cambio fue del lado de la aseguradora.",
      interno: true,
    },
  );
  exigir(
    await abrirIncidente(
      db,
      ctxSur,
      {
        producto: "cotiweb",
        asunto: "¿Cómo agrego un plan de hogar?",
        prioridad: "BAJA",
        texto: "Queremos cotizar hogar con Sancor y no encontramos el plan en la lista.",
      },
      HOY,
    ),
    "pedido 2",
  );

  // Comunicaciones y marca blanca.
  const MEDIOS = {
    sistema: false,
    portal: false,
    mail: true,
    sms: false,
    push: false,
    whatsapp: true,
  };
  exigir(
    await guardarTipoComunicacion(
      db,
      sur.empresaId,
      esquemaTipoComunicacion.parse({
        nombre: "Vencimiento de póliza",
        medios: MEDIOS,
        reglas: [{ origen: "PRODUCTOR", destinos: ["ASEGURADO"], autorizantes: ["ADMIN_OFICINA"] }],
        activo: true,
      }),
      sur.adminUsuarioId,
    ),
    "comunicación 1",
  );
  exigir(
    await guardarTipoComunicacion(
      db,
      sur.empresaId,
      esquemaTipoComunicacion.parse({
        nombre: "Saludo de cumpleaños",
        medios: { ...MEDIOS, whatsapp: false, push: true },
        reglas: [{ origen: "ADMIN_EMPRESA", destinos: ["ASEGURADO"], autorizantes: [] }],
        activo: true,
      }),
      sur.adminUsuarioId,
    ),
    "comunicación 2",
  );
  await guardarMarca(
    db,
    sur.empresaId,
    esquemaMarca.parse({
      nombreComercial: "Broker del Sur",
      eslogan: "Tu seguro, en buenas manos",
      colorPrimario: "#0B4F8A",
      colorSecundario: "#F2B705",
      textoBienvenida: "Bienvenido a tu portal de seguros.",
      web: "https://brokerdelsur.demo",
      email: "hola@brokerdelsur.demo",
      whatsapp: "+54 9 11 5555-1000",
    }),
    { accion: "MANTENER" },
    sur.adminUsuarioId,
  );

  // Una compra pendiente de pago (link de pago).
  await comprar(db, sur.empresaId, sur.adminUsuarioId, [["NOTI-10K", "Pago único", 1]], {
    medio: "LINK_MP",
    pagar: false,
  });

  // ─── 2. Andino: un cliente con dos empresas, una corporativa ─────────────
  const andino = await nuevoCliente(
    db,
    {
      tipoPersona: "JURIDICA",
      nombre: "Andino Seguros SRL",
      tipoSociedad: "SRL",
      cuit: "30-70555444-3",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "San Martín 850",
        ciudad: "Mendoza",
        codigoPostal: "5500",
        provincia: "Mendoza",
      },
      administrador: {
        nombre: "Jorge Andrade",
        email: "jorge@andino.demo",
        telefono: "0261 420-5000",
      },
      empresa: { nombre: "Andino Mendoza", tipoCliente: "DIRECTO", tipoInstalacion: "SAAS" },
    },
    adminId,
  );
  await comprar(
    db,
    andino.empresaId,
    andino.adminUsuarioId,
    [
      ["PRO-INICIAL", "Mensual", 2],
      ["NOTI-10K", "Pago único", 1],
    ],
    { medio: "LINK_MP", pagar: { actorId: adminId }, dias: 25 },
  );
  await aseguradoras(db, andino, ["MERCANT", "SANCOR"], true);
  await productor(
    db,
    andino,
    {
      nombre: "Castro, Sofía",
      tipoPersona: "FISICA",
      cuit: "27-33444555-6",
      condicionIva: "MONOTRIBUTO",
    },
    [["MERCANT", "MA-7710"]],
  );
  await usuario(db, andino, {
    nombre: "Valeria Andrade",
    email: "valeria@andino.demo",
    adminComercial: true,
    accesoProdigal: true,
  });

  // Segunda empresa del mismo cliente: corporativa, habilitada sin pagar.
  const [otraEmpresa] = await db
    .insert(t.empresas)
    .values({
      clienteId: andino.clienteId,
      nombre: "Andino San Juan",
      nombreCorto: "ANDINO SJ",
      paisId: "AR",
      tipoCliente: "CORPORATIVO",
      tipoInstalacion: "ON_PREMISE",
    })
    .returning();
  if (otraEmpresa) {
    const [canal] = await db
      .insert(t.canales)
      .values({ empresaId: otraEmpresa.id, codigo: "01", nombre: "Casa central" })
      .returning();
    if (canal)
      await db.insert(t.oficinas).values({
        empresaId: otraEmpresa.id,
        canalId: canal.id,
        codigo: "001",
        nombre: "San Juan centro",
      });
    await db.insert(t.colaboradores).values({
      empresaId: otraEmpresa.id,
      nombre: "Jorge Andrade",
      email: "jorge@andino.demo",
      usuarioId: andino.adminUsuarioId,
      adminGeneral: true,
      adminComercial: true,
      adminOperativo: true,
    });
    await comprar(db, otraEmpresa.id, andino.adminUsuarioId, [["PRO-FULL", "Mensual", 1]], {
      medio: "TRANSF",
      pagar: false,
    });
  }

  // ─── 3. Productor independiente: persona física, orden pendiente ─────────
  const martin = await nuevoCliente(
    db,
    {
      tipoPersona: "FISICA",
      nombre: "Martínez, Martín",
      cuit: "20-25666777-1",
      condicionIva: "MONOTRIBUTO",
      domicilioFiscal: {
        calle: "Belgrano 420",
        ciudad: "Paraná",
        codigoPostal: "3100",
        provincia: "Entre Ríos",
      },
      administrador: {
        nombre: "Martín Martínez",
        email: "martin@productor.demo",
        telefono: "0343 431-2000",
      },
      empresa: { nombre: "Martínez Seguros", tipoCliente: "DIRECTO", tipoInstalacion: "SAAS" },
    },
    adminId,
  );
  await comprar(db, martin.empresaId, martin.adminUsuarioId, [["PRO-INICIAL", "Mensual", 1]], {
    medio: "LINK_MP",
    pagar: false,
  });

  // ─── 4. Grupo Patagonia: dos clientes, facturación al principal ─────────
  const patagonia = await nuevoCliente(
    db,
    {
      tipoPersona: "JURIDICA",
      nombre: "Patagonia Brokers SA",
      tipoSociedad: "SA",
      cuit: "30-71888999-1",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "Mitre 150",
        ciudad: "Neuquén",
        codigoPostal: "8300",
        provincia: "Neuquén",
      },
      administrador: {
        nombre: "Gabriela Sosa",
        email: "gabriela@patagonia.demo",
        telefono: "0299 442-1000",
      },
      empresa: { nombre: "Patagonia Brokers", tipoCliente: "DIRECTO", tipoInstalacion: "SAAS" },
    },
    adminId,
  );
  await comprar(
    db,
    patagonia.empresaId,
    patagonia.adminUsuarioId,
    [
      ["PRO-FULL", "Mensual", 1],
      ["BS-BASE", "Mensual", 1],
    ],
    { medio: "TRANSF", pagar: { actorId: adminId }, dias: 10 },
  );
  await aseguradoras(db, patagonia, ["SEGUNDA", "RIVADAV"], true);
  const austral = await nuevoCliente(
    db,
    {
      tipoPersona: "JURIDICA",
      nombre: "Austral Productores SRL",
      tipoSociedad: "SRL",
      cuit: "30-71777666-2",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "Roca 900",
        ciudad: "Bariloche",
        codigoPostal: "8400",
        provincia: "Río Negro",
      },
      administrador: {
        nombre: "Hernán Díaz",
        email: "hernan@austral.demo",
        telefono: "0294 442-3000",
      },
      empresa: { nombre: "Austral Productores", tipoCliente: "DIRECTO", tipoInstalacion: "SAAS" },
    },
    adminId,
  );
  await comprar(db, austral.empresaId, austral.adminUsuarioId, [["PRO-INICIAL", "Mensual", 1]], {
    medio: "TRANSF",
    pagar: { actorId: adminId },
    dias: 5,
  });
  const grupo = exigir(
    await guardarGrupo(
      db,
      esquemaGrupo.parse({
        nombre: "Grupo Patagonia",
        nombreCorto: "PATAGONIA",
        principal: "30718889991",
        facturacion: "30718889991",
      }),
      adminId,
    ),
    "grupo",
  );
  await agregarAlGrupo(db, grupo.id, "30717776662", adminId);

  // ─── 5. Litoral Asesores: licencia vencida (para ver los avisos) ─────────
  const litoral = await nuevoCliente(
    db,
    {
      tipoPersona: "JURIDICA",
      nombre: "Litoral Asesores SRL",
      tipoSociedad: "SRL",
      cuit: "30-70333222-2",
      condicionIva: "EXENTO",
      domicilioFiscal: {
        calle: "Bv. Gálvez 1500",
        ciudad: "Santa Fe",
        codigoPostal: "3000",
        provincia: "Santa Fe",
      },
      administrador: {
        nombre: "Irene Lopez",
        email: "irene@litoral.demo",
        telefono: "0342 455-6000",
      },
      empresa: { nombre: "Litoral Asesores", tipoCliente: "DIRECTO", tipoInstalacion: "SAAS" },
    },
    adminId,
  );
  await comprar(db, litoral.empresaId, litoral.adminUsuarioId, [["PRO-INICIAL", "Mensual", 1]], {
    medio: "TRANSF",
    pagar: { actorId: adminId },
    dias: 45,
  });

  // Avisos del día (vencimientos, saldos, licencias).
  await procesoDiario(db, HOY);
  console.info("[demo] listo.");
}

principal()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("[demo] falló:", error);
    process.exit(1);
  });
