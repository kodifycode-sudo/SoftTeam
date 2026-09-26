import { after } from "next/server";
import { json, problema } from "@/server/api/http";
import { obtenerFacturador, obtenerPasarela } from "@/server/cobros";
import { obtenerDb } from "@/server/db";
import { facturarOrden } from "@/server/modules/cobros/facturacion";
import { procesarPago } from "@/server/modules/cobros/pagos";
import { programarEntregaDeEventos } from "@/server/modules/integraciones/programar";

const TAMANO_MAXIMO = 16 * 1024;

/**
 * POST /api/pagos/aviso: la pasarela avisa el resultado de un pago.
 * - Firma inválida → 401.
 * - El aviso solo dice "hubo un pago": el estado real se consulta a la
 *   pasarela (no se confía en el contenido del aviso).
 * - Aplicar el pago es idempotente; si algo falla se responde 500 y la
 *   pasarela reintenta.
 */
export async function POST(peticion: Request) {
  const pasarela = obtenerPasarela();
  if (!pasarela) return problema(404, "Pasarela no configurada");
  const cuerpo = await peticion.text();
  if (cuerpo.length > TAMANO_MAXIMO) return problema(413, "Cuerpo demasiado grande");

  let aviso: ReturnType<typeof pasarela.leerAviso>;
  try {
    aviso = pasarela.leerAviso({ url: peticion.url, headers: peticion.headers, cuerpo });
  } catch {
    return problema(400, "Aviso ilegible");
  }
  if (!aviso.ok) {
    console.warn("[pagos] aviso con firma inválida");
    return problema(401, "Firma inválida");
  }
  if (!aviso.valor) return json({ resultado: "IGNORADO" });

  try {
    const pago = await pasarela.obtenerPago(aviso.valor.pagoId);
    if (!pago) return json({ resultado: "PAGO_DESCONOCIDO" });
    const db = await obtenerDb();
    const resultado = await procesarPago(db, pago);
    if (resultado === "APROBADO") {
      programarEntregaDeEventos();
      // La factura se emite apenas termina la respuesta; si falla, la
      // reintenta el proceso diario.
      const facturador = obtenerFacturador();
      if (facturador) {
        after(async () => {
          try {
            await facturarOrden(await obtenerDb(), facturador, pago.ordenId);
          } catch (error) {
            console.error("[pagos] no se pudo facturar ahora", error);
          }
        });
      }
    }
    return json({ resultado });
  } catch (error) {
    console.error("[pagos] error al procesar el aviso", error);
    return problema(500, "Error interno");
  }
}
