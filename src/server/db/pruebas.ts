import { eq } from "drizzle-orm";
import { porcentaje } from "@/domain/dinero";
import type { Fecha } from "@/domain/fecha";
import type { EstadoContrato } from "@/domain/licencias/contrato";
import { cantidadContratada } from "@/domain/licencias/licencia";
import { crearDbPglite, type Db } from "./cliente";
import * as t from "./schema";
import { sembrarDatosBase } from "./semilla";

/** Base en memoria, migrada y con el catálogo de demo. Solo para tests. */
export async function crearDbDePrueba(): Promise<Db> {
  const db = await crearDbPglite();
  await sembrarDatosBase(db, { demo: true });
  return db;
}

let secuenciaCuit = 0;

export async function crearEmpresaDePrueba(
  db: Db,
  opciones: { tipoCliente?: "DIRECTO" | "CORPORATIVO" } = {},
) {
  secuenciaCuit += 1;
  const [cliente] = await db
    .insert(t.clientes)
    .values({
      tipoPersona: "JURIDICA",
      nombre: `Cliente ${secuenciaCuit}`,
      nombreFactura: `Cliente ${secuenciaCuit}`,
      cuit: String(30_000_000_000 + secuenciaCuit),
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilioFiscal: {
        calle: "Calle 1",
        ciudad: "CABA",
        codigoPostal: "1000",
        provincia: "CABA",
        paisId: "AR",
      },
      contactoAdministrador: {
        nombre: "Admin",
        email: `admin${secuenciaCuit}@test.com`,
        telefono: null,
      },
    })
    .returning();
  const [empresa] = await db
    .insert(t.empresas)
    .values({
      clienteId: cliente!.id,
      nombre: `Empresa ${secuenciaCuit}`,
      nombreCorto: `EMP${secuenciaCuit}`,
      paisId: "AR",
      tipoCliente: opciones.tipoCliente ?? "DIRECTO",
    })
    .returning();
  const [medio] = await db.select().from(t.mediosPago).where(eq(t.mediosPago.codigo, "TRANSF"));
  const [orden] = await db
    .insert(t.ordenes)
    .values({
      empresaId: empresa!.id,
      clienteId: cliente!.id,
      clienteFacturacionId: cliente!.id,
      medioPagoId: medio!.id,
      moneda: "ARS",
      condicionIva: "RESPONSABLE_INSCRIPTO",
      tipoComprobante: "A",
      subtotalLista: 0n,
      bonificacionTotal: 0n,
      subtotal: 0n,
      baseNeta: 0n,
      ajustePagoPorcentaje: 0n,
      ajustePago: 0n,
      netoGravado: 0n,
      alicuotaIva: porcentaje("21"),
      iva: 0n,
      total: 0n,
    })
    .returning();
  return { cliente: cliente!, empresa: empresa!, orden: orden! };
}

/**
 * Contrata un paquete del catálogo demo para la empresa, copiando sus
 * recursos × cantidad (como lo hará la confirmación de la orden).
 */
export async function crearContratoDePrueba(
  db: Db,
  ctx: { empresaId: string; ordenId: string },
  opciones: {
    codigoPaquete: string;
    estado: EstadoContrato;
    desde: Fecha | null;
    hasta: Fecha | null;
    pendPagoActivoHasta?: Fecha | null;
    cantidad?: number;
  },
) {
  const paquete = await db.query.paquetes.findFirst({
    where: eq(t.paquetes.codigo, opciones.codigoPaquete),
  });
  const [alternativa] = await db
    .select()
    .from(t.alternativas)
    .where(eq(t.alternativas.paqueteId, paquete!.id));
  const cantidad = opciones.cantidad ?? 1;
  const [contrato] = await db
    .insert(t.contratos)
    .values({
      empresaId: ctx.empresaId,
      paqueteId: paquete!.id,
      alternativaId: alternativa!.id,
      ordenId: ctx.ordenId,
      tipoAccion: "ALTA",
      tipoPaquete: paquete!.tipo,
      cantidad,
      meses: alternativa!.meses,
      estado: opciones.estado,
      desde: opciones.desde,
      hasta: opciones.hasta,
      pendPagoActivoHasta: opciones.pendPagoActivoHasta ?? null,
      precioLista: alternativa!.precioCompra,
      precioFinal: alternativa!.precioCompra,
    })
    .returning();
  const recursos = await db
    .select({
      recursoId: t.paqueteRecursos.recursoId,
      cantidad: t.paqueteRecursos.cantidad,
      clase: t.recursos.clase,
      agregacion: t.recursos.agregacion,
    })
    .from(t.paqueteRecursos)
    .innerJoin(t.recursos, eq(t.recursos.id, t.paqueteRecursos.recursoId))
    .where(eq(t.paqueteRecursos.paqueteId, paquete!.id));
  await db.insert(t.contratoRecursos).values(
    recursos.map((r) => ({
      contratoId: contrato!.id,
      recursoId: r.recursoId,
      clase: r.clase,
      cantidad: cantidadContratada(r.cantidad, cantidad, r.agregacion),
    })),
  );
  return contrato!;
}
