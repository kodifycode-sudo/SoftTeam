import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { cabecerasFirmadas, verificarFirma } from "@/server/seguridad/firma";
import { consumir, type PedidoConsumo } from "../consumos/consumir";
import { autenticarPeticion } from "./autenticacion";
import { empresaCompleta, licenciaParaApi, listarEmpresasParaSincronizar } from "./datos";
import { type Enviar, entregarEventos, MAXIMO_INTENTOS, registrarCambioEmpresa } from "./eventos";
import { limpiarUsoApi, registrarPedido, usoUltimaHora } from "./limite";
import { crearSistema, rotarSecreto } from "./sistemas";

const HOY = fecha("2026-09-25");
const CLAVE = randomBytes(32).toString("base64");
let db: Db;
let actorId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  actorId = (await db.query.usuarios.findFirst())!.id;
});

/** Empresa con cupo mensual (BienSeguro: 1.000/mes) y saldo prepago. */
async function empresaConCreditos() {
  const { empresa, orden } = await crearEmpresaDePrueba(db);
  const ctx = { empresaId: empresa.id, ordenId: orden.id };
  const cupo = await crearContratoDePrueba(db, ctx, {
    codigoPaquete: "BS-BASE",
    estado: "ACTIVO",
    desde: fecha("2026-09-01"),
    hasta: fecha("2026-09-30"),
  });
  const prepago = await crearContratoDePrueba(db, ctx, {
    codigoPaquete: "NOTI-10K",
    estado: "ACTIVO",
    desde: fecha("2026-09-01"),
    hasta: null,
  });
  await db.insert(t.movimientosSaldo).values({
    contratoId: prepago.id,
    recursoId: "notificaciones.saldo",
    clase: "SALDO",
    tipo: "CARGA",
    creditos: 10000,
  });
  const [canal] = await db
    .insert(t.canales)
    .values({ empresaId: empresa.id, codigo: "01", nombre: "Central" })
    .returning();
  await db
    .insert(t.oficinas)
    .values({ empresaId: empresa.id, canalId: canal!.id, codigo: "001", nombre: "Central" });
  return { empresa, cupo, prepago };
}

const pedido = (empresaNumero: number, parcial: Partial<PedidoConsumo> = {}): PedidoConsumo => ({
  sistema: "bienseguro",
  empresaNumero,
  familia: "notificaciones",
  cantidad: 100,
  modo: "PARCIAL",
  transaccion: crypto.randomUUID(),
  ...parcial,
});

describe("consumir", () => {
  it("usa primero el cupo del mes y después el saldo, con el factor del medio", async () => {
    const { empresa, cupo, prepago } = await empresaConCreditos();
    // 500 WhatsApp × 2,5 = 1.250 créditos: 1.000 del cupo + 250 del saldo.
    const r = await consumir(db, pedido(empresa.numero, { cantidad: 500, medio: "whatsapp" }), HOY);
    expect(r).toEqual({
      ok: true,
      valor: expect.objectContaining({
        solicitado: 1250,
        consumido: 1250,
        factor: 2.5,
        completo: true,
        disponible: 9750,
      }),
    });
    const movimientos = await db
      .select()
      .from(t.movimientosSaldo)
      .where(eq(t.movimientosSaldo.tipo, "CONSUMO"));
    expect(movimientos.find((m) => m.contratoId === cupo.id)).toMatchObject({
      creditos: -1000,
      periodo: "2026-09",
    });
    expect(movimientos.find((m) => m.contratoId === prepago.id)).toMatchObject({
      creditos: -250,
      periodo: null,
    });
  });

  it("es idempotente: un reintento del producto no descuenta dos veces", async () => {
    const { empresa } = await empresaConCreditos();
    const p = pedido(empresa.numero, { transaccion: "envio-123" });
    const primero = await consumir(db, p, HOY);
    const segundo = await consumir(db, p, HOY);
    expect(primero.ok && primero.valor.repetido).toBe(false);
    expect(segundo).toMatchObject({
      ok: true,
      valor: { repetido: true, consumido: 100, disponible: null },
    });
    const licencia = await licenciaParaApi(db, empresa.numero, HOY);
    expect(licencia?.productos.notificaciones?.mes).toEqual({ total: 1000, disponible: 900 });
  });

  it("TODO_O_NADA no descuenta si no alcanza", async () => {
    const { empresa } = await empresaConCreditos();
    const r = await consumir(
      db,
      pedido(empresa.numero, { cantidad: 20000, modo: "TODO_O_NADA" }),
      HOY,
    );
    expect(r).toMatchObject({
      ok: true,
      valor: { solicitado: 20000, consumido: 0, completo: false },
    });
  });

  it("una oficina usa el saldo de la empresa hasta el tope mensual de la política", async () => {
    const { empresa } = await empresaConCreditos();
    await db.insert(t.politicasEmpresa).values({
      empresaId: empresa.id,
      politicas: {
        oficinasNotifican: true,
        oficinasUsanPozoEmpresa: true,
        topeMensualPozoPorOficina: 300,
        oficinasContratan: true,
      },
    });
    const primera = await consumir(
      db,
      pedido(empresa.numero, { oficina: "01001", cantidad: 200 }),
      HOY,
    );
    const segunda = await consumir(
      db,
      pedido(empresa.numero, { oficina: "01-001", cantidad: 200 }),
      HOY,
    );
    expect(primera).toMatchObject({ ok: true, valor: { consumido: 200 } });
    expect(segunda).toMatchObject({ ok: true, valor: { consumido: 100, completo: false } });
  });

  it("rechaza oficinas, medios y empresas inexistentes", async () => {
    const { empresa } = await empresaConCreditos();
    expect(await consumir(db, pedido(empresa.numero, { oficina: "09999" }), HOY)).toMatchObject({
      error: "OFICINA_INEXISTENTE",
    });
    expect(await consumir(db, pedido(empresa.numero, { medio: "paloma" }), HOY)).toMatchObject({
      error: "MEDIO_INVALIDO",
    });
    expect(await consumir(db, pedido(999999), HOY)).toMatchObject({ error: "EMPRESA_INEXISTENTE" });
  });
});

describe("autenticarPeticion", () => {
  it("acepta una petición firmada y rechaza alteraciones, secretos viejos y sistemas inactivos", async () => {
    const sistema = "prodigal";
    const creado = await crearSistema(db, { sistema, nombre: "Prodigal" }, CLAVE, actorId);
    if (!creado.ok) throw new Error("no se creó el sistema");
    const ruta = "/api/v1/empresas/2000/consumos";
    const cuerpo = JSON.stringify({ cantidad: 10 });
    const ahora = 1_790_000_000;
    const peticion = (secreto: string, cuerpoEnviado = cuerpo) =>
      new Request(`https://stlic.test${ruta}`, {
        method: "POST",
        headers: cabecerasFirmadas(sistema, secreto, { metodo: "POST", ruta, cuerpo }, ahora),
        body: cuerpoEnviado,
      });

    expect(
      await autenticarPeticion(db, peticion(creado.secreto), cuerpo, CLAVE, ahora),
    ).toMatchObject({
      ok: true,
      sistema,
      uso: { permitido: true, limite: 600, restantes: 599 },
    });
    expect(
      await autenticarPeticion(db, peticion(creado.secreto), '{"cantidad":9999}', CLAVE, ahora),
    ).toMatchObject({
      error: "FIRMA_INVALIDA",
    });

    const sistemaId = (await db.query.apiClientes.findFirst({
      where: eq(t.apiClientes.sistema, sistema),
    }))!.id;
    const nuevo = await rotarSecreto(db, sistemaId, CLAVE, actorId);
    expect(
      await autenticarPeticion(db, peticion(creado.secreto), cuerpo, CLAVE, ahora),
    ).toMatchObject({
      error: "FIRMA_INVALIDA",
    });
    expect(await autenticarPeticion(db, peticion(nuevo!), cuerpo, CLAVE, ahora)).toMatchObject({
      ok: true,
    });

    await db.update(t.apiClientes).set({ activo: false }).where(eq(t.apiClientes.id, sistemaId));
    expect(await autenticarPeticion(db, peticion(nuevo!), cuerpo, CLAVE, ahora)).toMatchObject({
      error: "SISTEMA_DESCONOCIDO",
    });
  });
});

describe("outbox de webhooks", () => {
  it("encola avisos por cada sistema con webhook y los entrega firmados", async () => {
    const alta = await crearSistema(
      db,
      { sistema: "cotiweb", nombre: "CotiWeb", webhookUrl: "https://cotiweb.test/stlic/avisos" },
      CLAVE,
      actorId,
    );
    if (!alta.ok) throw new Error("no se creó el sistema");
    const { empresa } = await crearEmpresaDePrueba(db);
    await db.transaction((tx) => registrarCambioEmpresa(tx, [empresa.id]));

    const recibidos: { url: string; init: RequestInit }[] = [];
    const enviar: Enviar = async (url, init) => {
      recibidos.push({ url, init });
      return { ok: true, status: 200 };
    };
    const resumen = await entregarEventos(db, { claveMaestra: CLAVE, enviar });
    expect(resumen.entregados).toBeGreaterThanOrEqual(1);

    const aviso = recibidos.find((r) =>
      String(r.init.body).includes(`"empresa":${empresa.numero}`),
    );
    expect(aviso?.url).toBe("https://cotiweb.test/stlic/avisos");
    const cabeceras = aviso?.init.headers as Record<string, string>;
    // El receptor puede verificar la firma con su secreto.
    expect(
      verificarFirma(
        alta.secreto,
        {
          metodo: "POST",
          ruta: "/stlic/avisos",
          cuerpo: String(aviso?.init.body),
          timestamp: cabeceras["x-stlic-timestamp"] ?? null,
        },
        cabeceras["x-stlic-firma"] ?? null,
      ),
    ).toEqual({ ok: true });

    // Entregado: no se vuelve a enviar.
    expect((await entregarEventos(db, { claveMaestra: CLAVE, enviar })).entregados).toBe(0);
  });

  it("reintenta con espera creciente y marca FALLIDO al agotar los intentos", async () => {
    await db.update(t.eventosSalida).set({ estado: "ENTREGADO" });
    const { empresa } = await crearEmpresaDePrueba(db);
    await db.transaction((tx) => registrarCambioEmpresa(tx, [empresa.id]));
    const caido: Enviar = async () => ({ ok: false, status: 503 });

    // El evento recién encolado vence "ahora" (reloj real): se simula un instante posterior.
    let ahora = new Date(Date.now() + 1000);
    const primero = await entregarEventos(db, { claveMaestra: CLAVE, enviar: caido, ahora });
    expect(primero.reintentos).toBeGreaterThanOrEqual(1);
    const [evento] = await db
      .select()
      .from(t.eventosSalida)
      .where(eq(t.eventosSalida.estado, "PENDIENTE"));
    expect(evento?.ultimoError).toBe("El webhook respondió 503");
    expect(evento?.proximoIntentoEn.getTime()).toBe(ahora.getTime() + 60_000);

    // Antes del próximo intento no se reenvía.
    expect(
      (await entregarEventos(db, { claveMaestra: CLAVE, enviar: caido, ahora })).reintentos,
    ).toBe(0);

    for (let i = 1; i < MAXIMO_INTENTOS; i++) {
      ahora = new Date(ahora.getTime() + 2 * 24 * 3600_000);
      await entregarEventos(db, { claveMaestra: CLAVE, enviar: caido, ahora });
    }
    const [final] = await db
      .select()
      .from(t.eventosSalida)
      .where(eq(t.eventosSalida.id, evento!.id));
    expect(final).toMatchObject({ estado: "FALLIDO", intentos: MAXIMO_INTENTOS });
  });
});

describe("outbox: cola acumulada y concurrencia", () => {
  it("un sistema caído con avisos acumulados no demora a los demás", async () => {
    await db.update(t.eventosSalida).set({ estado: "ENTREGADO" });
    await crearSistema(
      db,
      { sistema: "caido", nombre: "Caído", webhookUrl: "https://caido.test/avisos" },
      CLAVE,
      actorId,
    );
    await crearSistema(
      db,
      { sistema: "sano", nombre: "Sano", webhookUrl: "https://sano.test/avisos" },
      CLAVE,
      actorId,
    );
    await db
      .update(t.apiClientes)
      .set({ activo: false })
      .where(eq(t.apiClientes.sistema, "cotiweb"));
    // 40 cambios: 40 avisos para cada sistema, más de un lote.
    const { empresa } = await crearEmpresaDePrueba(db);
    for (let i = 0; i < 40; i++)
      await db.transaction((tx) => registrarCambioEmpresa(tx, [empresa.id]));

    const recibidos: string[] = [];
    const enviar: Enviar = async (url) => {
      if (url.includes("caido")) throw new Error("ECONNREFUSED");
      recibidos.push(url);
      return { ok: true, status: 200 };
    };
    const resumen = await entregarEventos(db, {
      claveMaestra: CLAVE,
      enviar,
      ahora: new Date(Date.now() + 1000),
    });
    expect(recibidos).toHaveLength(40);
    expect(resumen).toMatchObject({ entregados: 40, reintentos: 40 });
  });

  it("dos ejecuciones simultáneas no envían el mismo aviso", async () => {
    await db.update(t.eventosSalida).set({ estado: "ENTREGADO" });
    const { empresa } = await crearEmpresaDePrueba(db);
    for (let i = 0; i < 10; i++)
      await db.transaction((tx) => registrarCambioEmpresa(tx, [empresa.id]));
    const enviados = new Map<string, number>();
    const enviar: Enviar = async (_url, init) => {
      const id = JSON.parse(String(init.body)).id as string;
      enviados.set(id, (enviados.get(id) ?? 0) + 1);
      return { ok: true, status: 200 };
    };
    const ahora = new Date(Date.now() + 1000);
    await Promise.all([
      entregarEventos(db, { claveMaestra: CLAVE, enviar, ahora, limite: 3 }),
      entregarEventos(db, { claveMaestra: CLAVE, enviar, ahora, limite: 3 }),
    ]);
    expect([...enviados.values()].every((veces) => veces === 1)).toBe(true);
    expect(enviados.size).toBeGreaterThan(0);
  });
});

describe("datos de la API", () => {
  it("estructura completa, licencia y listado de sincronización", async () => {
    const { empresa } = await empresaConCreditos();
    const completa = await empresaCompleta(db, empresa.numero);
    expect(completa).toMatchObject({
      version: "EmpresaFull_V1",
      empresa: { numero: empresa.numero, activa: true },
      oficinas: [{ codigo: "01001", nombre: "Central" }],
    });

    const licencia = await licenciaParaApi(db, empresa.numero, HOY);
    expect(licencia?.productos.bienseguro).toMatchObject({ usuarios: 3, app: true });
    expect(licencia?.proximoVencimiento).toBe("2026-09-30");

    const desde = new Date(Date.now() - 60_000);
    await db.transaction((tx) => registrarCambioEmpresa(tx, [empresa.id]));
    const modificadas = await listarEmpresasParaSincronizar(db, { modificadasDesde: desde }, HOY);
    expect(modificadas.find((e) => e.numero === empresa.numero)?.productos).toEqual([
      "bienseguro",
      "notificaciones",
    ]);
  });

  it("una empresa desactivada no tiene licencia", async () => {
    const { empresa } = await empresaConCreditos();
    await db.update(t.empresas).set({ activa: false }).where(eq(t.empresas.id, empresa.id));
    expect((await licenciaParaApi(db, empresa.numero, HOY))?.productos).toEqual({});
  });
});

describe("límite de pedidos por sistema", () => {
  it("cuenta por minuto, corta al superar el límite y vuelve a aceptar en el minuto siguiente", async () => {
    const creado = await crearSistema(
      db,
      { sistema: "limitado", nombre: "Limitado" },
      CLAVE,
      actorId,
    );
    if (!creado.ok) throw new Error("no se creó el sistema");
    const { id } = (await db.query.apiClientes.findFirst({
      where: eq(t.apiClientes.sistema, "limitado"),
    }))!;
    const minuto = new Date("2026-09-25T15:30:00Z");
    const a = (segundos: number) => new Date(minuto.getTime() + segundos * 1000);

    const usos = [];
    for (const segundo of [1, 20, 40]) usos.push(await registrarPedido(db, id, 2, a(segundo)));
    expect(usos.map((u) => [u.permitido, u.restantes])).toEqual([
      [true, 1],
      [true, 0],
      [false, 0],
    ]);
    expect(usos[2]?.reinicio).toBe(20);
    // Minuto nuevo: cupo nuevo.
    expect(await registrarPedido(db, id, 2, a(61))).toMatchObject({
      permitido: true,
      restantes: 1,
    });

    // Pedidos simultáneos no se pisan: se cuentan todos.
    await Promise.all(Array.from({ length: 5 }, () => registrarPedido(db, id, 100, a(130))));
    const uso = await usoUltimaHora(db, a(200));
    expect(uso.get(id)).toEqual({ pedidos: 9, pico: 5 });

    expect(
      await limpiarUsoApi(db, new Date(minuto.getTime() + 2 * 24 * 3600_000)),
    ).toBeGreaterThanOrEqual(3);
    expect((await usoUltimaHora(db, a(200))).get(id)).toBeUndefined();
  });
});
