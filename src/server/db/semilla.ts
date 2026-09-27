import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { centavos, porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import type { ClaseRecurso } from "@/domain/licencias/licencia";
import type { Ejecutor } from "./cliente";
import * as t from "./schema";

/*
 * Datos iniciales. Todo es idempotente: se puede correr en cada arranque sin
 * duplicar nada (ON CONFLICT DO NOTHING o búsqueda previa por código).
 */

const PRODUCTOS = [
  { id: "prodigal", nombre: "Prodigal · Gestión", orden: 1 },
  { id: "cotiweb", nombre: "CotiWeb · Cotización", orden: 2 },
  { id: "bienseguro", nombre: "BienSeguro · Portal", orden: 3 },
  { id: "boletin", nombre: "Boletín C@", orden: 4 },
  { id: "notificaciones", nombre: "Notificaciones", orden: 5 },
  { id: "mailing", nombre: "Mail marketing", orden: 6 },
  { id: "soporte", nombre: "Soporte técnico", orden: 7 },
] as const;

type ProductoId = (typeof PRODUCTOS)[number]["id"];

const RECURSOS: readonly [string, ProductoId, string, ClaseRecurso, string | null][] = [
  ["prodigal.usuarios", "prodigal", "Usuarios", "CAPACIDAD", "usuarios"],
  ["prodigal.polizas", "prodigal", "Pólizas vigentes", "CAPACIDAD", "pólizas"],
  ["prodigal.retencion", "prodigal", "Retención de cartera", "CAPACIDAD", "años"],
  ["prodigal.interfaces", "prodigal", "Interfaces con aseguradoras", "CAPACIDAD", "interfaces"],
  ["prodigal.gb", "prodigal", "Espacio de documentos", "CAPACIDAD", "GB"],
  ["prodigal.institorio", "prodigal", "Agente institorio", "FUNCION", null],
  ["cotiweb.usuarios", "cotiweb", "Usuarios", "CAPACIDAD", "usuarios"],
  ["cotiweb.interfaces", "cotiweb", "Interfaces con aseguradoras", "CAPACIDAD", "interfaces"],
  ["cotiweb.cotizaciones_mes", "cotiweb", "Cotizaciones por mes", "CUPO_MENSUAL", "cotizaciones"],
  ["cotiweb.cotizaciones", "cotiweb", "Cotizaciones sin vencimiento", "SALDO", "cotizaciones"],
  ["cotiweb.autos", "cotiweb", "Cotización de autos", "FUNCION", null],
  ["cotiweb.motos", "cotiweb", "Cotización de motos", "FUNCION", null],
  ["cotiweb.emision", "cotiweb", "Emisión directa", "FUNCION", null],
  ["cotiweb.ecommerce", "cotiweb", "E-commerce", "FUNCION", null],
  ["cotiweb.api", "cotiweb", "API", "FUNCION", null],
  ["bienseguro.usuarios", "bienseguro", "Usuarios", "CAPACIDAD", "usuarios"],
  ["bienseguro.asegurados", "bienseguro", "Asegurados con acceso", "CAPACIDAD", "asegurados"],
  ["bienseguro.chatbot", "bienseguro", "Chatbot", "FUNCION", null],
  ["bienseguro.app", "bienseguro", "App para asegurados", "FUNCION", null],
  ["bienseguro.api", "bienseguro", "API", "FUNCION", null],
  ["boletin.boletines", "boletin", "Boletines por mes", "CAPACIDAD", "boletines"],
  ["notificaciones.mes", "notificaciones", "Notificaciones por mes", "CUPO_MENSUAL", "créditos"],
  ["notificaciones.saldo", "notificaciones", "Notificaciones sin vencimiento", "SALDO", "créditos"],
  ["mailing.plataforma", "mailing", "Plataforma de mail marketing", "FUNCION", null],
  ["soporte.mes", "soporte", "Tickets de soporte por mes", "CUPO_MENSUAL", "tickets"],
  ["soporte.saldo", "soporte", "Tickets de soporte sin vencimiento", "SALDO", "tickets"],
];

/** Capacidades que no se suman entre contratos ni unidades. */
const RECURSOS_POR_MAXIMO = new Set(["prodigal.retencion"]);

const MEDIOS_ENVIO = [
  { id: "mail", nombre: "Mail", factorCentesimos: 100 },
  { id: "app", nombre: "App BienSeguro", factorCentesimos: 100 },
  { id: "sms", nombre: "SMS", factorCentesimos: 200 },
  { id: "whatsapp", nombre: "WhatsApp", factorCentesimos: 250 },
];

const PARAMETROS: { clave: string; valor: unknown; descripcion: string }[] = [
  {
    clave: "renovacion.dias_corte",
    valor: [5, 15],
    descripcion:
      "Días del mes en que corre la renovación. El primero renueva vencimientos del 1 al 15; el segundo, del 16 a fin de mes.",
  },
  {
    clave: "cobranza.semaforo_dias",
    valor: [10, 21],
    descripcion: "Antigüedad en días de una orden impaga para pasar a amarillo y a rojo.",
  },
  {
    clave: "cobranza.recordatorios_dias",
    valor: [10, 20, 28],
    descripcion: "Días del mes en que se envían recordatorios de órdenes impagas.",
  },
  {
    clave: "alertas.vencimiento_dias",
    valor: [15, 7, 1],
    descripcion: "Días de anticipación de los avisos de vencimiento.",
  },
  {
    clave: "alertas.saldo_bajo_porcentaje",
    valor: 20,
    descripcion: "Porcentaje de saldo restante que dispara el aviso de saldo bajo.",
  },
  {
    clave: "oficinas.pedido_facturacion",
    valor: false,
    descripcion:
      "Si la empresa puede pedir desde el portal que las compras de una oficina se facturen a otro cliente. Apagado: solo lo asigna SOFTeam.",
  },
];

export async function sembrarDatosBase(db: Ejecutor, opciones: { demo: boolean }): Promise<void> {
  await db
    .insert(t.paises)
    .values({
      id: "AR",
      nombre: "Argentina",
      prefijoTelefonico: "54",
      moneda: "ARS",
      alicuotaIvaGeneral: porcentaje("21"),
    })
    .onConflictDoNothing();

  await db
    .insert(t.productos)
    .values([...PRODUCTOS])
    .onConflictDoNothing();
  await db
    .insert(t.recursos)
    .values(
      RECURSOS.map(([id, productoId, nombre, clase, unidad], orden) => ({
        id,
        productoId,
        nombre,
        clase,
        agregacion: RECURSOS_POR_MAXIMO.has(id) ? ("MAXIMO" as const) : ("SUMA" as const),
        unidad,
        orden,
      })),
    )
    .onConflictDoNothing();
  await db.insert(t.mediosEnvio).values(MEDIOS_ENVIO).onConflictDoNothing();
  await db.insert(t.parametros).values(PARAMETROS).onConflictDoNothing();

  // Medios de pago sugeridos (documento de mejora 6.2). Los ajustes están
  // "a definir" por Administración: arrancan en 0 %.
  await db
    .insert(t.mediosPago)
    .values([
      {
        codigo: "TRANSF",
        nombre: "Transferencia bancaria",
        tipo: "TRANSFERENCIA",
        orden: 1,
        instrucciones:
          "Transferí el total indicado y enviá el comprobante a administracion@softeam.com.ar.",
      },
      { codigo: "LINK_MP", nombre: "Link de pago", tipo: "LINK_MP", generaLink: true, orden: 2 },
      {
        codigo: "SUSC_MP",
        nombre: "Débito automático (Mercado Pago)",
        tipo: "SUSCRIPCION_MP",
        generaLink: true,
        habilitadoAlta: false,
        habilitadoAdicional: false,
        orden: 3,
      },
      {
        codigo: "PLAN_FP",
        nombre: "Planilla FP",
        tipo: "PLANILLA",
        planilla: true,
        habilitadoAlta: false,
        orden: 4,
      },
      {
        codigo: "PLAN_VIC",
        nombre: "Planilla Victoria",
        tipo: "PLANILLA",
        planilla: true,
        habilitadoAlta: false,
        orden: 5,
      },
    ])
    .onConflictDoNothing();

  await sembrarAseguradoras(db, opciones.demo);
  await asegurarAdministrador(db);
  if (opciones.demo) await sembrarDemo(db);
}

/**
 * Usuario inicial de Administración SOFTeam (credenciales del entorno). En
 * producción solo se crea si hay una contraseña explícita: nunca con la de
 * desarrollo.
 */
async function asegurarAdministrador(db: Ejecutor) {
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) return;
  const email = process.env.ADMIN_EMAIL ?? "admin@softeam.local";
  const existe = await db.query.usuarios.findFirst({ where: eq(t.usuarios.email, email) });
  if (existe) return;
  const id = crypto.randomUUID();
  await db.insert(t.usuarios).values({
    id,
    name: "Administración SOFTeam",
    email,
    emailVerified: true,
    rolSofteam: "ADMINISTRACION",
  });
  await db.insert(t.cuentasAuth).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(process.env.ADMIN_PASSWORD ?? "Softeam.2026!"),
  });
}

interface PaqueteDemo {
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: "TEMPORAL" | "CONSUMIBLE";
  recursos: Record<string, number>;
  alternativas: { nombre: string; meses: number | null; compra: string; renovacion: string }[];
}

const PAQUETES_DEMO: PaqueteDemo[] = [
  {
    codigo: "PRO-INICIAL",
    nombre: "Prodigal Inicial",
    descripcion: "Gestión de cartera para productores que empiezan.",
    tipo: "TEMPORAL",
    recursos: {
      "prodigal.usuarios": 2,
      "prodigal.polizas": 1500,
      "prodigal.retencion": 2,
      "prodigal.interfaces": 3,
      "prodigal.gb": 5,
      "soporte.mes": 2,
    },
    alternativas: [
      { nombre: "Mensual", meses: 1, compra: "38000", renovacion: "35000" },
      { nombre: "Anual", meses: 12, compra: "399000", renovacion: "378000" },
    ],
  },
  {
    codigo: "PRO-FULL",
    nombre: "Prodigal Full",
    descripcion: "Gestión completa para organizaciones con varias oficinas.",
    tipo: "TEMPORAL",
    recursos: {
      "prodigal.usuarios": 10,
      "prodigal.polizas": 15000,
      "prodigal.retencion": 5,
      "prodigal.interfaces": 15,
      "prodigal.gb": 50,
      "prodigal.institorio": 1,
      "soporte.mes": 10,
    },
    alternativas: [
      { nombre: "Mensual", meses: 1, compra: "100000", renovacion: "95000" },
      { nombre: "Anual", meses: 12, compra: "1080000", renovacion: "1020000" },
    ],
  },
  {
    codigo: "CW-PRO",
    nombre: "CotiWeb Pro",
    descripcion: "Multicotización con emisión directa y e-commerce.",
    tipo: "TEMPORAL",
    recursos: {
      "cotiweb.usuarios": 4,
      "cotiweb.interfaces": 10,
      "cotiweb.cotizaciones_mes": 2000,
      "cotiweb.autos": 1,
      "cotiweb.motos": 1,
      "cotiweb.ecommerce": 1,
    },
    alternativas: [{ nombre: "Mensual", meses: 1, compra: "65000", renovacion: "62000" }],
  },
  {
    codigo: "BS-BASE",
    nombre: "BienSeguro Base",
    descripcion: "Portal y app para que tus asegurados se autogestionen.",
    tipo: "TEMPORAL",
    recursos: {
      "bienseguro.usuarios": 3,
      "bienseguro.asegurados": 2500,
      "bienseguro.app": 1,
      "notificaciones.mes": 1000,
    },
    alternativas: [{ nombre: "Mensual", meses: 1, compra: "50000", renovacion: "48000" }],
  },
  {
    codigo: "NOTI-10K",
    nombre: "Notificaciones 10.000",
    descripcion: "Créditos sin vencimiento para mail, SMS o WhatsApp.",
    tipo: "CONSUMIBLE",
    recursos: { "notificaciones.saldo": 10000 },
    alternativas: [{ nombre: "Pago único", meses: null, compra: "30000", renovacion: "30000" }],
  },
  {
    codigo: "SOPORTE-10",
    nombre: "Soporte 10 tickets",
    descripcion: "Diez consultas a Soporte técnico, sin vencimiento.",
    tipo: "CONSUMIBLE",
    recursos: { "soporte.saldo": 10 },
    alternativas: [{ nombre: "Pago único", meses: null, compra: "25000", renovacion: "25000" }],
  },
];

/** Catálogo de ejemplo para desarrollo. */
async function sembrarDemo(db: Ejecutor) {
  for (const [orden, p] of PAQUETES_DEMO.entries()) {
    const existe = await db.query.paquetes.findFirst({ where: eq(t.paquetes.codigo, p.codigo) });
    if (existe) continue;
    const [paquete] = await db
      .insert(t.paquetes)
      .values({
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion,
        paisId: "AR",
        tipo: p.tipo,
        ventaDesde: fecha("2026-01-01"),
      })
      .returning({ id: t.paquetes.id });
    if (!paquete) continue;
    await db.insert(t.paqueteRecursos).values(
      Object.entries(p.recursos).map(([recursoId, cantidad]) => ({
        paqueteId: paquete.id,
        recursoId,
        cantidad,
      })),
    );
    await db.insert(t.alternativas).values(
      p.alternativas.map((a, i) => ({
        paqueteId: paquete.id,
        nombre: a.nombre,
        meses: a.meses,
        precioCompra: centavos(a.compra),
        precioRenovacion: centavos(a.renovacion),
        orden: orden * 10 + i,
      })),
    );
  }
}

/**
 * Aseguradoras de Argentina. En producción se cargan sin interfaces
 * habilitadas: la disponibilidad real de cada interfaz la define SOFTeam.
 * En la demo se marcan algunas para poder probar.
 */
async function sembrarAseguradoras(db: Ejecutor, demo: boolean) {
  await db
    .insert(t.aseguradoras)
    .values(
      [
        ["La Segunda", "SEGUNDA", true, true],
        ["Sancor Seguros", "SANCOR", true, true],
        ["Federación Patronal", "FEDPAT", true, true],
        ["Mercantil Andina", "MERCANT", true, true],
        ["Rivadavia Seguros", "RIVADAV", true, false],
        ["Allianz", "ALLIANZ", true, true],
        ["Zurich", "ZURICH", false, true],
        ["San Cristóbal", "SANCRIS", true, true],
      ].map(([nombre, abreviatura, prodigal, cotiweb]) => ({
        paisId: "AR",
        nombre: nombre as string,
        abreviatura: abreviatura as string,
        interfazProdigalDisponible: demo && (prodigal as boolean),
        interfazCotiwebDisponible: demo && (cotiweb as boolean),
      })),
    )
    .onConflictDoNothing();
}
