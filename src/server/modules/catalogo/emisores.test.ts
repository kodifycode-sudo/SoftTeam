import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { fecha } from "@/domain/fecha";
import { crearFacturadorSimulado } from "@/server/cobros/facturador";
import type { Db } from "@/server/db/cliente";
import { crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import {
  esquemaFacturaManual,
  facturarOrden,
  historialFacturado,
  registrarFacturaManual,
} from "../cobros/facturacion";
import { crearCliente } from "../cuentas/creacion";
import { agregarAlCarrito } from "../ventas/carrito";
import { confirmarOrden, cotizarCarrito, mediosParaEmpresa } from "../ventas/checkout";
import { registrarPago } from "../ventas/ordenes";
import { credencialesEmisor, type EntradaEmisor, guardarEmisor, listarEmisores } from "./emisores";

const HOY = fecha("2026-09-25");
const CLAVE = randomBytes(32).toString("base64");
let db: Db;
let usuarioId: string;

beforeAll(async () => {
  db = await crearDbDePrueba();
  usuarioId = (await db.query.usuarios.findFirst())!.id;
});

let cuitSecuencia = 0;
/** CUIT válido distinto en cada llamada (dígito verificador calculado). */
function cuitValido(): string {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    cuitSecuencia++;
    const base = `3071${String(500_000 + cuitSecuencia).padStart(6, "0")}`;
    const resto = 11 - ([...base].reduce((s, d, i) => s + Number(d) * (pesos[i] ?? 0), 0) % 11);
    if (resto !== 10) return `${base}${resto === 11 ? 0 : resto}`;
  }
}

const entrada = (parcial: Partial<EntradaEmisor> = {}): EntradaEmisor => ({
  razonSocial: "Contacto Asegurado SRL",
  cuit: cuitValido(),
  condicionIva: "RESPONSABLE_INSCRIPTO",
  domicilioFiscal: "Av. Siempreviva 742, Rosario",
  paisId: "AR",
  preferido: false,
  activo: true,
  xubio: false,
  mercadoPago: false,
  ...parcial,
});

describe("emisores (Mejora v2.1, 5.11)", () => {
  it("guarda las credenciales cifradas y nunca las lista", async () => {
    const r = await guardarEmisor(
      db,
      entrada({
        xubio: true,
        xubioClientId: "cliente-xubio",
        xubioSecreto: "secreto-xubio",
        mercadoPago: true,
        mpAccessToken: "APP_USR-token",
        mpSecretoAvisos: "clave-avisos",
      }),
      usuarioId,
      CLAVE,
    );
    if (!r.ok) throw new Error(r.error);
    const fila = await db.query.emisores.findFirst({ where: eq(t.emisores.id, r.id) });
    expect(fila?.xubioSecretoCifrado).not.toContain("secreto-xubio");
    expect(fila?.mpAccessTokenCifrado).not.toContain("APP_USR");

    const listado = (await listarEmisores(db)).find((e) => e.id === r.id);
    expect(listado).toMatchObject({ xubioSecretoCargado: true, mpAccessTokenCargado: true });
    expect(JSON.stringify(listado)).not.toContain("Cifrado");

    expect(await credencialesEmisor(db, r.id, CLAVE)).toMatchObject({
      xubio: { clientId: "cliente-xubio", secretId: "secreto-xubio" },
      mercadoPago: { token: "APP_USR-token", secretoAvisos: "clave-avisos" },
    });

    // Un secreto vacío conserva el que estaba; la auditoría no lo guarda.
    await guardarEmisor(
      db,
      entrada({ id: r.id, cuit: fila!.cuit, xubio: true, mercadoPago: true }),
      usuarioId,
      CLAVE,
    );
    expect((await credencialesEmisor(db, r.id, CLAVE))?.xubio?.secretId).toBe("secreto-xubio");
    const auditoria = await db.query.auditoria.findMany({
      where: and(eq(t.auditoria.entidad, "emisor"), eq(t.auditoria.entidadId, r.id)),
    });
    expect(JSON.stringify(auditoria)).not.toContain("secreto-xubio");
  });

  it("emite A y B, no repite CUIT y tiene un solo preferido por país", async () => {
    expect(await guardarEmisor(db, entrada({ condicionIva: "EXENTO" }), usuarioId, CLAVE)).toEqual({
      ok: false,
      error: "CONDICION_INVALIDA",
    });
    const cuit = cuitValido();
    const primero = await guardarEmisor(db, entrada({ cuit, preferido: true }), usuarioId, CLAVE);
    expect(await guardarEmisor(db, entrada({ cuit }), usuarioId, CLAVE)).toEqual({
      ok: false,
      error: "CUIT_DUPLICADO",
    });
    const segundo = await guardarEmisor(db, entrada({ preferido: true }), usuarioId, CLAVE);
    if (!primero.ok || !segundo.ok) throw new Error("no se guardaron");
    const preferidos = (await listarEmisores(db)).filter((e) => e.preferido);
    expect(preferidos.map((e) => e.id)).toEqual([segundo.id]);

    // Un cliente nuevo recibe el preferido de su país.
    const cliente = await crearCliente(db, {
      tipoPersona: "JURIDICA",
      nombre: "Cliente con emisor",
      cuit: cuitValido(),
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "Calle 1",
        ciudad: "Rosario",
        codigoPostal: "2000",
        provincia: "Santa Fe",
        paisId: "AR",
      },
      contactoAdministrador: { nombre: "Ana", email: "ana.emisor@test.com", telefono: null },
    });
    const guardado = await db.query.clientes.findFirst({ where: eq(t.clientes.id, cliente.id) });
    expect(guardado?.emisorId).toBe(segundo.id);
  });
});

describe("la venta usa el emisor del cliente", () => {
  async function carrito(emisorId: string) {
    const { empresa, cliente } = await crearEmpresaDePrueba(db);
    await db.delete(t.ordenes).where(eq(t.ordenes.empresaId, empresa.id));
    await db.update(t.clientes).set({ emisorId }).where(eq(t.clientes.id, cliente.id));
    const [alt] = await db
      .select({ id: t.alternativas.id })
      .from(t.alternativas)
      .innerJoin(t.paquetes, eq(t.paquetes.id, t.alternativas.paqueteId))
      .where(and(eq(t.paquetes.codigo, "NOTI-10K"), eq(t.alternativas.nombre, "Pago único")));
    await agregarAlCarrito(
      db,
      { empresaId: empresa.id, alternativaId: alt!.id, cantidad: 1, usuarioId },
      HOY,
    );
    return { empresa, cliente };
  }

  it("la orden congela el emisor y, sin Mercado Pago, no se ofrece el link", async () => {
    const r = await guardarEmisor(
      db,
      entrada({ razonSocial: "Emisor sin MP SA" }),
      usuarioId,
      CLAVE,
    );
    if (!r.ok) throw new Error(r.error);
    const { empresa } = await carrito(r.id);
    const medios = (await mediosParaEmpresa(db, empresa.id)).map((m) => m.codigo);
    expect(medios).not.toContain("LINK_MP");
    expect(medios).toContain("TRANSF");

    const confirmada = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!confirmada.ok) throw new Error(confirmada.error);
    const orden = await db.query.ordenes.findFirst({
      where: eq(t.ordenes.id, confirmada.valor.ordenId),
    });
    expect(orden).toMatchObject({ emisorId: r.id, emisorRazonSocial: "Emisor sin MP SA" });
  });

  it("sin ningún emisor activo no se puede vender", async () => {
    const { empresa } = await carrito((await listarEmisores(db))[0]!.id);
    await db.update(t.emisores).set({ activo: false });
    const r = await cotizarCarrito(db, empresa.id, {}, HOY);
    await db.update(t.emisores).set({ activo: true });
    expect(r).toMatchObject({ ok: false, error: "SIN_EMISOR" });
  });

  it("sin Xubio la factura se registra a mano y queda en el historial", async () => {
    const r = await guardarEmisor(
      db,
      entrada({ razonSocial: "Emisor a mano SRL" }),
      usuarioId,
      CLAVE,
    );
    if (!r.ok) throw new Error(r.error);
    const { empresa, cliente } = await carrito(r.id);
    const confirmada = await confirmarOrden(
      db,
      { empresaId: empresa.id, usuarioId, claveIdempotencia: crypto.randomUUID() },
      HOY,
    );
    if (!confirmada.ok) throw new Error(confirmada.error);
    const ordenId = confirmada.valor.ordenId;
    await registrarPago(db, ordenId, usuarioId, HOY);

    // El facturador del emisor es null: no se emite sola.
    expect(await facturarOrden(db, async () => null, ordenId)).toEqual({ estado: "MANUAL" });
    expect(esquemaFacturaManual.safeParse({ ordenId, numero: "A 1 2", fecha: HOY }).success).toBe(
      false,
    );
    const manual = esquemaFacturaManual.parse({ ordenId, numero: "a-0001-00001234", fecha: HOY });
    expect(await registrarFacturaManual(db, manual, usuarioId)).toEqual({ ok: true });
    expect(await registrarFacturaManual(db, manual, usuarioId)).toEqual({
      ok: false,
      error: "YA_FACTURADA",
    });
    expect(await facturarOrden(db, crearFacturadorSimulado(), ordenId)).toEqual({
      estado: "YA_FACTURADA",
    });

    const historial = await historialFacturado(db, cliente.id);
    expect(historial).toEqual([
      expect.objectContaining({
        id: ordenId,
        facturaNumero: "A-0001-00001234",
        emisorRazonSocial: "Emisor a mano SRL",
      }),
    ]);
  });
});
