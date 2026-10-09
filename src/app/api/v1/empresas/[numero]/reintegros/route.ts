import { z } from "zod";
import { FAMILIAS } from "@/domain/consumos/familias";
import { conApiFirmada, json, numeroEmpresa, problema } from "@/server/api/http";
import { type RechazoReintegro, reintegrar } from "@/server/modules/consumos/reintegrar";

const esquema = z.object({
  familia: z.enum(FAMILIAS),
  cantidad: z.number().int().min(1).max(1_000_000),
  transaccion: z.string().trim().min(1).max(80),
  transaccionOrigen: z.string().trim().min(1).max(80),
  espera: z.enum(["ESPERAR", "NO_ESPERAR"]).default("ESPERAR"),
});

const RESPUESTAS: Record<RechazoReintegro, [number, string]> = {
  EMPRESA_INEXISTENTE: [404, "Empresa inexistente"],
  ORIGEN_INEXISTENTE: [
    404,
    "No hay una solicitud de ese sistema, empresa y tipo con esa transacción",
  ],
  TRANSACCION_DUPLICADA: [409, "La transacción ya se usó para otra operación"],
  REINTEGRO_EXCEDE: [422, "Se reintegra más de lo entregado en la solicitud de origen"],
  EN_CURSO_REINTENTAR: [
    409,
    "Hay otro pedido de la empresa en curso: reintentá con la misma transacción",
  ],
};

/**
 * POST /api/v1/empresas/{numero}/reintegros
 * Devuelve unidades de una solicitud de consumo que no se usaron. Idempotente
 * por (sistema, transacción).
 */
export async function POST(
  peticion: Request,
  { params }: RouteContext<"/api/v1/empresas/[numero]/reintegros">,
) {
  return conApiFirmada(peticion, async ({ db, sistema, cuerpo }) => {
    const numero = numeroEmpresa((await params).numero);
    if (numero === undefined) return problema(404, "Empresa inexistente");

    let datos: unknown;
    try {
      datos = JSON.parse(cuerpo);
    } catch {
      return problema(400, "JSON inválido");
    }
    const pedido = esquema.safeParse(datos);
    if (!pedido.success) {
      return problema(422, "Datos inválidos", undefined, {
        errores: pedido.error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })),
      });
    }

    const resultado = await reintegrar(db, { ...pedido.data, sistema, empresaNumero: numero });
    if (!resultado.ok) {
      const [status, titulo] = RESPUESTAS[resultado.error];
      return problema(status, titulo, undefined, { codigo: resultado.error });
    }
    return json(resultado.valor, resultado.valor.repetido ? 200 : 201);
  });
}
