import { importeCsv } from "@/domain/exportacion/csv";
import { requerirComercial } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import { listarOrdenes } from "@/server/modules/ventas/ordenes";

const ESTADOS = { PEND_PAGO: "Pendiente", PAGADA: "Pagada", CANCELADA: "Cancelada" } as const;

/** GET /portal/ordenes/exportar: órdenes de la empresa activa, en CSV. */
export async function GET() {
  const contexto = await requerirComercial();
  const ordenes = await listarOrdenes(await obtenerDb(), {
    empresaId: contexto.empresaId,
    clienteId: contexto.clienteId,
    alcance: contexto.alcance,
  });
  return respuestaCsv("mis ordenes", ordenes, [
    { titulo: "Orden", valor: (f) => f.numero },
    { titulo: "Estado", valor: (f) => ESTADOS[f.estado] },
    { titulo: "Tipo", valor: (f) => (f.tipoGeneracion === "RENOVACION" ? "Renovación" : "Compra") },
    { titulo: "Medio de pago", valor: (f) => f.medio },
    { titulo: "Emitida", valor: (f) => f.emitidaEn },
    { titulo: "Pagada", valor: (f) => f.pagadaEn },
    { titulo: "Factura", valor: (f) => f.facturaNumero },
    { titulo: "Total", valor: (f) => importeCsv(f.total) },
  ]);
}
