import { z } from "zod";
import { FAMILIAS } from "@/domain/consumos/familias";
import { conApiFirmada, json, numeroEmpresa, problema } from "@/server/api/http";
import { consumir, type RechazoConsumo } from "@/server/modules/consumos/consumir";

const esquema = z.object({
  familia: z.enum(FAMILIAS),
  cantidad: z.number().int().min(1).max(1_000_000),
  medio: z.string().trim().max(20).optional(),
  oficina: z.string().trim().max(6).optional(),
  /** Por defecto no se descuenta nada si no alcanza (el producto decide). */
  modo: z.enum(["TODO_O_NADA", "PARCIAL"]).default("TODO_O_NADA"),
  transaccion: z.string().trim().min(1).max(80),
  concepto: z.string().trim().max(200).optional(),
});

const RESPUESTAS: Record<RechazoConsumo, [number, string]> = {
  EMPRESA_INEXISTENTE: [404, "Empresa inexistente"],
  EMPRESA_INACTIVA: [409, "La empresa está inactiva"],
  OFICINA_INEXISTENTE: [422, "La oficina no existe o está inactiva"],
  OFICINA_SIN_PERMISO: [403, "La política de la empresa no permite que las oficinas notifiquen"],
  MEDIO_INVALIDO: [422, "Medio de envío inválido"],
};

/**
 * POST /api/v1/empresas/{numero}/consumos
 * Descuenta créditos de notificaciones o cotizaciones. Idempotente por
 * (sistema, transacción): reenviar la misma transacción devuelve el
 * resultado original sin volver a descontar.
 */
export async function POST(
  peticion: Request,
  { params }: RouteContext<"/api/v1/empresas/[numero]/consumos">,
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

    const resultado = await consumir(db, {
      ...pedido.data,
      sistema,
      empresaNumero: numero,
    });
    if (!resultado.ok) {
      const [status, titulo] = RESPUESTAS[resultado.error];
      return problema(status, titulo, undefined, { codigo: resultado.error });
    }
    return json(resultado.valor, resultado.valor.repetido ? 200 : 201);
  });
}
