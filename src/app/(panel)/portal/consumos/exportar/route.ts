import { requerirCliente } from "@/server/auth/sesion";
import { obtenerDb } from "@/server/db";
import { respuestaCsv } from "@/server/exportacion";
import { consumosDeEmpresa } from "@/server/modules/reportes/reportes";

/** GET /portal/consumos/exportar: historial de consumos de la empresa activa, en CSV. */
export async function GET() {
  const contexto = await requerirCliente();
  const consumos = await consumosDeEmpresa(await obtenerDb(), contexto.empresaId, contexto.alcance);
  return respuestaCsv("consumos", consumos, [
    { titulo: "Fecha", valor: (f) => f.registradoEn },
    { titulo: "Tipo", valor: (f) => f.familia },
    { titulo: "Sistema", valor: (f) => f.sistema },
    { titulo: "Medio", valor: (f) => f.medioNombre ?? f.medio },
    { titulo: "Oficina", valor: (f) => f.oficina },
    { titulo: "Cantidad", valor: (f) => f.cantidad },
    { titulo: "Créditos pedidos", valor: (f) => f.solicitados },
    { titulo: "Créditos descontados", valor: (f) => f.consumidos },
    { titulo: "Concepto", valor: (f) => f.concepto },
  ]);
}
