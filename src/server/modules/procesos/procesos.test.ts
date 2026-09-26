import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { porcentaje } from "@/domain/dinero";
import { fecha } from "@/domain/fecha";
import { ventanasDeRenovacion } from "@/domain/procesos/calendario";
import type { Db } from "@/server/db/cliente";
import { crearContratoDePrueba, crearDbDePrueba, crearEmpresaDePrueba } from "@/server/db/pruebas";
import * as t from "@/server/db/schema";
import { registrarPago } from "../ventas/ordenes";
import { claveDeAlerta, enviarAlertasPendientes, type MailAlerta } from "./alertas";
import { procesoDiario } from "./diario";
import { ejecutarJob } from "./jobs";
import { correrProcesos } from "./procesos";
import { procesoRecordatorios } from "./recordatorios";
import { procesoRenovacion } from "./renovacion";
import { cambiarRenovacionAutomatica, estadoDeRenovacion } from "./renovacion-automatica";

let db: Db;
beforeAll(async () => {
  db = await crearDbDePrueba();
});

const alertasDe = (empresaId: string) =>
  db.select().from(t.alertas).where(eq(t.alertas.empresaId, empresaId));

async function empresaConContrato(
  opciones: Partial<Parameters<typeof crearContratoDePrueba>[2]> & {
    tipoCliente?: "DIRECTO" | "CORPORATIVO";
  } = {},
) {
  const { empresa, orden, cliente } = await crearEmpresaDePrueba(db, {
    tipoCliente: opciones.tipoCliente ?? "DIRECTO",
  });
  const contrato = await crearContratoDePrueba(
    db,
    { empresaId: empresa.id, ordenId: orden.id },
    {
      codigoPaquete: "PRO-INICIAL",
      estado: "ACTIVO",
      desde: fecha("2026-10-01"),
      hasta: fecha("2026-10-31"),
      ...opciones,
    },
  );
  return { empresa, orden, cliente, contrato };
}

describe("ejecutarJob", () => {
  it("corre una sola vez por clave y permite reintentar un error", async () => {
    let corridas = 0;
    const trabajo = async () => {
      corridas++;
      return { ok: true };
    };
    expect(await ejecutarJob(db, "prueba", "2026-10-01", trabajo)).toEqual({
      estado: "OK",
      resumen: { ok: true },
    });
    expect(await ejecutarJob(db, "prueba", "2026-10-01", trabajo)).toEqual({ estado: "YA_CORRIO" });
    expect(corridas).toBe(1);

    const falla = await ejecutarJob(db, "prueba", "2026-10-02", async () => {
      throw new Error("se cayó");
    });
    expect(falla).toEqual({ estado: "ERROR", error: "se cayó" });
    expect((await ejecutarJob(db, "prueba", "2026-10-02", trabajo)).estado).toBe("OK");
  });
});

describe("proceso diario", () => {
  it("vence las excepciones de pago con plazo cumplido", async () => {
    const { contrato } = await empresaConContrato({
      estado: "PEND_PAGO_ACTIVO",
      pendPagoActivoHasta: fecha("2026-10-09"),
    });
    await procesoDiario(db, fecha("2026-10-09"));
    expect(
      (await db.query.contratos.findFirst({ where: eq(t.contratos.id, contrato.id) }))?.estado,
    ).toBe("PEND_PAGO_ACTIVO");
    const resumen = await procesoDiario(db, fecha("2026-10-10"));
    expect(resumen.excepcionesVencidas).toBeGreaterThanOrEqual(1);
    expect(
      (await db.query.contratos.findFirst({ where: eq(t.contratos.id, contrato.id) }))?.estado,
    ).toBe("PEND_PAGO");
  });

  it("avisa el vencimiento por tramos, una sola vez por tramo", async () => {
    const { empresa, contrato } = await empresaConContrato();
    await procesoDiario(db, fecha("2026-10-16")); // faltan 15 días
    await procesoDiario(db, fecha("2026-10-17"));
    await procesoDiario(db, fecha("2026-10-25")); // faltan 6
    const tipos = (await alertasDe(empresa.id))
      .filter((a) => a.contratoId === contrato.id)
      .map((a) => a.tipo);
    expect(tipos.sort()).toEqual(["VENCIMIENTO_15D", "VENCIMIENTO_7D"]);
  });

  it("no avisa si el contrato no se renueva a pedido o ya tiene renovación", async () => {
    const noRenovar = await empresaConContrato();
    await db
      .update(t.contratos)
      .set({ noRenovar: true })
      .where(eq(t.contratos.id, noRenovar.contrato.id));
    const renovado = await empresaConContrato();
    await procesoRenovacion(db, ventanasDeRenovacion(fecha("2026-09-15"))[3]!);
    await procesoDiario(db, fecha("2026-10-25"));
    for (const e of [noRenovar, renovado]) {
      const vencimientos = (await alertasDe(e.empresa.id)).filter((a) =>
        a.tipo.startsWith("VENCIMIENTO"),
      );
      expect(vencimientos).toEqual([]);
    }
  });

  it("avisa la licencia vencida sin renovación habilitada", async () => {
    const { empresa } = await empresaConContrato({ hasta: fecha("2026-10-08") });
    await procesoDiario(db, fecha("2026-10-10"));
    expect((await alertasDe(empresa.id)).map((a) => a.tipo)).toContain("LICENCIA_VENCIDA");
  });

  it("avisa saldo bajo y agotado, y se rearma con una compra nueva", async () => {
    const { empresa, contrato } = await empresaConContrato({
      codigoPaquete: "NOTI-10K",
      desde: fecha("2026-10-01"),
      hasta: null,
    });
    const mover = (creditos: number, tipo: "CARGA" | "CONSUMO") =>
      db.insert(t.movimientosSaldo).values({
        contratoId: contrato.id,
        recursoId: "notificaciones.saldo",
        clase: "SALDO",
        tipo,
        creditos,
      });
    await mover(10_000, "CARGA");
    await mover(-8_500, "CONSUMO");
    await procesoDiario(db, fecha("2026-10-10"));
    await procesoDiario(db, fecha("2026-10-11"));
    await mover(-1_500, "CONSUMO");
    await procesoDiario(db, fecha("2026-10-12"));
    const tipos = (await alertasDe(empresa.id)).map((a) => a.tipo);
    expect(tipos.filter((x) => x === "SALDO_BAJO")).toHaveLength(1);
    expect(tipos.filter((x) => x === "SALDO_AGOTADO")).toHaveLength(1);
  });

  it("avisa a la empresa sin paquetes una vez por mes", async () => {
    const { empresa } = await crearEmpresaDePrueba(db);
    await procesoDiario(db, fecha("2026-10-10"));
    await procesoDiario(db, fecha("2026-10-11"));
    await procesoDiario(db, fecha("2026-11-02"));
    const sinPaquete = (await alertasDe(empresa.id)).filter(
      (a) => a.tipo === "EMPRESA_SIN_PAQUETE",
    );
    expect(sinPaquete).toHaveLength(2);
  });

  it("avisa cuando hay más usuarios activos que los licenciados", async () => {
    const { empresa } = await empresaConContrato(); // 2 usuarios de Prodigal
    await db.insert(t.colaboradores).values(
      [1, 2, 3].map((n) => ({
        empresaId: empresa.id,
        nombre: `Usuario ${n}`,
        email: `u${n}.${empresa.numero}@test.com`,
        accesoProdigal: true,
      })),
    );
    await procesoDiario(db, fecha("2026-10-10"));
    const excedido = (await alertasDe(empresa.id)).find((a) => a.tipo === "LIMITE_EXCEDIDO");
    expect(excedido?.mensaje).toContain("usuarios de Prodigal: 3 activos de 2");
  });
});

describe("renovación", () => {
  // El 15/9 se generan los vencimientos del 16 al 31/10.
  const ventana = () => {
    const v = ventanasDeRenovacion(fecha("2026-09-15")).at(-1);
    if (!v) throw new Error();
    return v;
  };

  it("genera la orden con el período empalmado y la bonificación recurrente", async () => {
    const { empresa, contrato } = await empresaConContrato();
    await db
      .update(t.contratos)
      .set({
        bonifPorcentaje: porcentaje("10"),
        bonifRecurrente: true,
        bonifMotivo: "Cliente fiel",
      })
      .where(eq(t.contratos.id, contrato.id));

    const resumen = await procesoRenovacion(db, ventana());
    expect(resumen.errores).toEqual([]);
    const nuevo = await db.query.contratos.findFirst({
      where: eq(t.contratos.contratoAnteriorId, contrato.id),
    });
    expect(nuevo).toMatchObject({
      estado: "PEND_PAGO",
      tipoAccion: "RENOVACION",
      desde: "2026-11-01",
      hasta: "2026-11-30",
      bonifRecurrente: true,
    });
    const orden = await db.query.ordenes.findFirst({ where: eq(t.ordenes.id, nuevo!.ordenId) });
    // Precio de renovación del mensual: 35.000 − 10 % = 31.500, más IVA 21 %.
    expect(orden).toMatchObject({
      tipoGeneracion: "RENOVACION",
      empresaId: empresa.id,
      subtotal: 3_150_000n,
      total: 3_811_500n,
    });
    const aviso = (await alertasDe(empresa.id)).find((a) => a.tipo === "RENOVACION_GENERADA");
    expect(aviso?.mensaje).toContain(`#${orden?.numero}`);

    // Reejecutar no duplica.
    await procesoRenovacion(db, ventana());
    expect(await db.$count(t.contratos, eq(t.contratos.contratoAnteriorId, contrato.id))).toBe(1);

    // Al pagar, conserva las fechas empalmadas.
    await registrarPago(db, nuevo!.ordenId, "actor", fecha("2026-11-05"));
    expect(
      await db.query.contratos.findFirst({ where: eq(t.contratos.id, nuevo!.id) }),
    ).toMatchObject({ estado: "ACTIVO", desde: "2026-11-01", hasta: "2026-11-30" });
  });

  it("no propaga una bonificación que no es recurrente", async () => {
    const { contrato } = await empresaConContrato();
    await db
      .update(t.contratos)
      .set({ bonifPorcentaje: porcentaje("50"), bonifRecurrente: false })
      .where(eq(t.contratos.id, contrato.id));
    await procesoRenovacion(db, ventana());
    const nuevo = await db.query.contratos.findFirst({
      where: eq(t.contratos.contratoAnteriorId, contrato.id),
    });
    expect(nuevo).toMatchObject({ bonifPorcentaje: 0n, precioFinal: 3_500_000n });
  });

  it("omite los marcados para no renovar y los que vencen fuera de la ventana", async () => {
    const noRenovar = await empresaConContrato();
    await db
      .update(t.contratos)
      .set({ noRenovar: true })
      .where(eq(t.contratos.id, noRenovar.contrato.id));
    const fuera = await empresaConContrato({ hasta: fecha("2026-10-10") });
    await procesoRenovacion(db, ventana());
    for (const c of [noRenovar.contrato, fuera.contrato]) {
      expect(await db.$count(t.contratos, eq(t.contratos.contratoAnteriorId, c.id))).toBe(0);
    }
  });

  it("un corporativo sigue habilitado sin límite mientras paga", async () => {
    const { contrato } = await empresaConContrato({ tipoCliente: "CORPORATIVO" });
    await procesoRenovacion(db, ventana());
    expect(
      await db.query.contratos.findFirst({
        where: eq(t.contratos.contratoAnteriorId, contrato.id),
      }),
    ).toMatchObject({ estado: "PEND_PAGO_ACTIVO", pendPagoActivoHasta: null });
  });

  it("planilla: una orden agrupada por cliente de facturación", async () => {
    const [planilla] = await db
      .select()
      .from(t.mediosPago)
      .where(eq(t.mediosPago.codigo, "PLAN_FP"));
    const a = await empresaConContrato();
    const b = await empresaConContrato();
    // Las dos empresas facturan al mismo cliente (el de la empresa A).
    const [grupo] = await db
      .insert(t.gruposEconomicos)
      .values({
        nombre: `Grupo ${a.empresa.numero}`,
        nombreCorto: `G${a.empresa.numero}`,
        clienteFacturacionId: a.cliente.id,
      })
      .returning();
    await db
      .update(t.clientes)
      .set({ grupoId: grupo!.id, medioPagoRenovacionId: planilla!.id })
      .where(eq(t.clientes.id, a.cliente.id));
    await db
      .update(t.clientes)
      .set({ grupoId: grupo!.id, medioPagoRenovacionId: planilla!.id })
      .where(eq(t.clientes.id, b.cliente.id));

    await procesoRenovacion(db, ventana());
    const nuevos = await Promise.all(
      [a, b].map((e) =>
        db.query.contratos.findFirst({
          where: eq(t.contratos.contratoAnteriorId, e.contrato.id),
        }),
      ),
    );
    expect(nuevos[0]?.ordenId).toBe(nuevos[1]?.ordenId);
    const orden = await db.query.ordenes.findFirst({
      where: eq(t.ordenes.id, nuevos[0]!.ordenId),
    });
    expect(orden).toMatchObject({
      agrupada: true,
      empresaId: null,
      clienteFacturacionId: a.cliente.id,
      periodo: "2026-10",
    });
  });
});

describe("recordatorios y envío de avisos", () => {
  it("recuerda cada orden impaga una vez por día", async () => {
    const { empresa, orden } = await crearEmpresaDePrueba(db);
    await procesoRecordatorios(db, fecha("2026-10-10"));
    await procesoRecordatorios(db, fecha("2026-10-10"));
    await procesoRecordatorios(db, fecha("2026-10-20"));
    const recordatorios = (await alertasDe(empresa.id)).filter(
      (a) => a.tipo === "RECORDATORIO_PAGO" && a.ordenId === orden.id,
    );
    expect(recordatorios).toHaveLength(2);
  });

  /** Empresa con un administrador general con usuario verificado. */
  async function empresaConAdmin() {
    const { empresa } = await crearEmpresaDePrueba(db);
    const email = `admin.avisos.${empresa.numero}@test.com`;
    const usuarioId = `u-${empresa.id}`;
    await db
      .insert(t.usuarios)
      .values({ id: usuarioId, name: "Admin", email, emailVerified: true });
    await db.insert(t.colaboradores).values({
      empresaId: empresa.id,
      nombre: "Admin",
      email,
      adminGeneral: true,
      usuarioId,
    });
    return { empresa, email };
  }

  it("envía los avisos a quienes administran la cuenta", async () => {
    const { empresa, email } = await empresaConAdmin();
    await procesoDiario(db, fecha("2026-10-10"));
    const enviados: MailAlerta[] = [];
    await enviarAlertasPendientes(db, async (m) => {
      enviados.push(m);
    });
    expect(enviados.find((m) => m.empresa === empresa.nombre)).toMatchObject({ para: [email] });
    const pendientes = await db
      .select()
      .from(t.alertas)
      .where(and(eq(t.alertas.empresaId, empresa.id), eq(t.alertas.estado, "PENDIENTE")));
    expect(pendientes).toEqual([]);
  });

  it("un error de envío queda registrado y se reintenta", async () => {
    // Deja enviado lo anterior para aislar este caso.
    await enviarAlertasPendientes(db, async () => {});
    const { empresa } = await empresaConAdmin();
    await procesoDiario(db, fecha("2026-10-10"));
    const conError = await enviarAlertasPendientes(db, async () => {
      throw new Error("Resend caído");
    });
    expect(conError.errores).toBeGreaterThan(0);
    const [alerta] = await alertasDe(empresa.id);
    expect(alerta).toMatchObject({ estado: "ERROR", error: "Resend caído" });

    await enviarAlertasPendientes(db, async () => {});
    const [reintentada] = await alertasDe(empresa.id);
    expect(reintentada?.estado).toBe("ENVIADA");
  });
});

describe("correrProcesos", () => {
  it("corre todo una vez por día", async () => {
    const hoy = fecha("2026-10-20");
    const primera = await correrProcesos(db, hoy, async () => {});
    expect(primera.renovacion.estado).toBe("OK");
    expect(primera.diario.estado).toBe("OK");
    expect(primera.recordatorios).not.toBe("NO_CORRESPONDE");
    const segunda = await correrProcesos(db, hoy, async () => {});
    expect(segunda.renovacion.estado).toBe("YA_CORRIO");
    expect(segunda.diario.estado).toBe("YA_CORRIO");
  });
});

describe("renovación automática elegida por el cliente", () => {
  const ventana = () => ventanasDeRenovacion(fecha("2026-09-15")).at(-1)!;

  it("desactivarla evita la renovación; con la orden ya generada no se puede", async () => {
    const a = await empresaConContrato();
    expect(
      await cambiarRenovacionAutomatica(db, a.empresa.id, a.contrato.id, false, "actor"),
    ).toEqual({ ok: true });
    const b = await empresaConContrato();
    // Otra empresa no puede tocar el contrato.
    expect(
      await cambiarRenovacionAutomatica(db, b.empresa.id, a.contrato.id, true, "actor"),
    ).toEqual({ ok: false, error: "NO_EXISTE" });

    await procesoRenovacion(db, ventana());
    expect(await db.$count(t.contratos, eq(t.contratos.contratoAnteriorId, a.contrato.id))).toBe(0);
    const estadoB = await estadoDeRenovacion(db, b.empresa.id, [b.contrato.id]);
    expect(estadoB.get(b.contrato.id)?.ordenRenovacion).toEqual(expect.any(Number));
    expect(
      await cambiarRenovacionAutomatica(db, b.empresa.id, b.contrato.id, false, "actor"),
    ).toEqual({ ok: false, error: "YA_RENOVADO" });
  });
});

describe("reprocesar a pedido", () => {
  it("forzar vuelve a correr un trabajo exitoso", async () => {
    let corridas = 0;
    const trabajo = async () => ++corridas;
    await ejecutarJob(db, "forzado", "2026-10-01", trabajo);
    expect((await ejecutarJob(db, "forzado", "2026-10-01", trabajo, { forzar: true })).estado).toBe(
      "OK",
    );
    expect(corridas).toBe(2);
  });
});

describe("claves de alerta", () => {
  it("compacta las claves largas sin perder unicidad", () => {
    const larga = (sufijo: string) => `PAGO_RECHAZADO:${"x".repeat(300)}${sufijo}`;
    expect(claveDeAlerta("corta")).toBe("corta");
    expect(claveDeAlerta(larga("a"))).toHaveLength(160);
    expect(claveDeAlerta(larga("a"))).toBe(claveDeAlerta(larga("a")));
    expect(claveDeAlerta(larga("a"))).not.toBe(claveDeAlerta(larga("b")));
  });
});
