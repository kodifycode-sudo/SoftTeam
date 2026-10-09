import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db, Ejecutor } from "@/server/db/cliente";
import * as t from "@/server/db/schema";
import { auditar } from "./auditoria";

/**
 * Lee un parámetro del sistema validando su forma. Si falta o está mal
 * cargado, usa el valor por defecto: un parámetro roto no tira abajo la app.
 */
export async function leerParametro<T>(
  db: Ejecutor,
  clave: string,
  esquema: z.ZodType<T>,
  porDefecto: T,
): Promise<T> {
  const fila = await db.query.parametros.findFirst({ where: eq(t.parametros.clave, clave) });
  const valor = esquema.safeParse(fila?.valor);
  return valor.success ? valor.data : porDefecto;
}

const numero = { error: "Ingresá solo números enteros." };
const dia = (max: number) =>
  z
    .int(numero)
    .min(1, { error: `Cada día va de 1 a ${max}.` })
    .max(max, { error: `Cada día va de 1 a ${max}.` });
const cantidad = (cuantos: number) => ({ error: `Indicá ${cuantos} valores separados por coma.` });
const distintos = (v: number[]) => new Set(v).size === v.length;

/**
 * Parámetros que SOFTeam puede cambiar sin desplegar. La misma validación se
 * usa al leer (con valor por defecto) y al guardar (con mensaje de error).
 */
export const PARAMETROS = {
  "renovacion.dias_corte": {
    grupo: "Renovación",
    etiqueta: "Días de generación de las renovaciones",
    ayuda:
      "Dos días del mes (1 a 28). Con 2 y 11: el día 2 renueva los vencimientos del 3 al 12 (los alineados al 10) y el 11, del 13 al 2 del mes siguiente (los alineados al 20).",
    tipo: "lista",
    esquema: z
      .tuple([dia(28), dia(28)], cantidad(2))
      .refine(([a, b]) => a < b, { error: "El primer día tiene que ser anterior al segundo." }),
    porDefecto: [2, 11] as [number, number],
  },
  "renovacion.dias_vencimiento": {
    grupo: "Renovación",
    etiqueta: "Días de vencimiento de los paquetes",
    ayuda:
      "Dos días del mes (1 a 28) a los que se alinean los vencimientos; el cliente elige uno al comprar o renovar (por ejemplo 10, 20).",
    tipo: "lista",
    esquema: z
      .tuple([dia(28), dia(28)], cantidad(2))
      .refine(([a, b]) => a < b, { error: "El primer día tiene que ser anterior al segundo." }),
    porDefecto: [10, 20] as [number, number],
  },
  "renovacion.dia_vencimiento_grupo": {
    grupo: "Renovación",
    etiqueta: "Día de vencimiento de los clientes agrupados",
    ayuda: "Día fijo (1 a 28) en que vencen los paquetes de los clientes de un grupo.",
    tipo: "numero",
    esquema: dia(28),
    porDefecto: 10,
  },
  "renovacion.minimo_dias_tramo": {
    grupo: "Renovación",
    etiqueta: "Tramo mínimo de una renovación (días)",
    ayuda:
      "Si el tramo hasta el día de vencimiento da menos, la renovación se alinea al mes siguiente.",
    tipo: "numero",
    esquema: z.int(numero).min(1, { error: "Entre 1 y 28." }).max(28, { error: "Entre 1 y 28." }),
    porDefecto: 10,
  },
  "tablero.dias_semaforo": {
    grupo: "Avisos",
    etiqueta: "Semáforo de renovaciones a negociar (días)",
    ayuda: "Amarillo si el paquete vence dentro de estos días; rojo si ya venció.",
    tipo: "numero",
    esquema: z.int(numero).min(1, { error: "Entre 1 y 30." }).max(30, { error: "Entre 1 y 30." }),
    porDefecto: 7,
  },
  "cobranza.semaforo_dias": {
    grupo: "Cobranza",
    etiqueta: "Semáforo de órdenes impagas (días)",
    ayuda: "Antigüedad en días para pasar a amarillo y a rojo (por ejemplo 10, 21).",
    tipo: "lista",
    esquema: z
      .tuple([dia(365), dia(365)], cantidad(2))
      .refine(([a, b]) => a < b, { error: "Amarillo tiene que ser antes que rojo." }),
    porDefecto: [10, 21] as [number, number],
  },
  "facturacion.tolerancia_dias": {
    grupo: "Cobranza",
    etiqueta: "Tolerancia de pago por modo de facturación (días)",
    ayuda:
      "Cuatro valores, uno por modo: pago directo, factura adelantada, suscripción y factura agrupada (por ejemplo 7, 30, 30, 90). En los modos 0 y 2 es la prórroga del paquete anterior mientras se paga la renovación; en el 1, el plazo del paquete habilitado sin pago; en el 3 no se suspende: se avisa a SOFTeam.",
    tipo: "lista",
    esquema: z.tuple([dia(365), dia(365), dia(365), dia(365)], cantidad(4)),
    porDefecto: [7, 30, 30, 90] as [number, number, number, number],
  },
  "cobranza.recordatorios_dias": {
    grupo: "Cobranza",
    etiqueta: "Días de recordatorio de cobro",
    ayuda: "Días del mes (1 a 31) en que se recuerdan las órdenes impagas.",
    tipo: "lista",
    esquema: z
      .array(dia(31), numero)
      .min(1, { error: "Indicá al menos un día." })
      .max(10)
      .refine(distintos, { error: "Hay días repetidos." }),
    porDefecto: [10, 20, 28],
  },
  "alertas.vencimiento_dias": {
    grupo: "Avisos",
    etiqueta: "Anticipación de los avisos de vencimiento (días)",
    ayuda: "Tres anticipaciones, de mayor a menor (por ejemplo 15, 7, 1).",
    tipo: "lista",
    esquema: z
      .tuple(
        [
          z.int(numero).min(0).max(90, { error: "Hasta 90 días." }),
          z.int(numero).min(0).max(90, { error: "Hasta 90 días." }),
          z.int(numero).min(0).max(90, { error: "Hasta 90 días." }),
        ],
        cantidad(3),
      )
      .refine(([a, b, c]) => a > b && b > c, { error: "Van de mayor a menor, sin repetir." }),
    porDefecto: [15, 7, 1] as [number, number, number],
  },
  "alertas.saldo_bajo_porcentaje": {
    grupo: "Avisos",
    etiqueta: "Saldo bajo (%)",
    ayuda: "Porcentaje de saldo restante que dispara el aviso de saldo bajo.",
    tipo: "numero",
    esquema: z.int(numero).min(1, { error: "Entre 1 y 99." }).max(99, { error: "Entre 1 y 99." }),
    porDefecto: 20,
  },
  "consumibles.porcentaje_renovacion": {
    grupo: "Renovación",
    etiqueta: "Renovación de consumibles (% de saldo)",
    ayuda:
      "Un paquete consumible con renovación automática se renueva cuando le queda este porcentaje de saldo o menos.",
    tipo: "numero",
    esquema: z.int(numero).min(1, { error: "Entre 1 y 99." }).max(99, { error: "Entre 1 y 99." }),
    porDefecto: 10,
  },
  "consumibles.espera_ms": {
    grupo: "Renovación",
    etiqueta: "Espera de un pedido de consumo en curso (ms)",
    ayuda:
      "Si otro pedido del mismo cliente se está procesando, cuánto espera el siguiente antes de responder que reintente.",
    tipo: "numero",
    esquema: z
      .int(numero)
      .min(100, { error: "Entre 100 y 30.000." })
      .max(30_000, { error: "Entre 100 y 30.000." }),
    porDefecto: 5000,
  },
  "oficinas.pedido_facturacion": {
    grupo: "Oficinas",
    etiqueta: "La empresa puede pedir facturar una oficina a otro cliente",
    ayuda:
      "Apagado: el cliente de facturación de una oficina solo lo asigna SOFTeam (decisión pendiente, ver ESPECIFICACION 4.3).",
    tipo: "booleano",
    esquema: z.boolean(),
    porDefecto: false,
  },
} as const;

export type ClaveParametro = keyof typeof PARAMETROS;
type ValorDe<K extends ClaveParametro> = z.infer<(typeof PARAMETROS)[K]["esquema"]>;

/** Lee un parámetro del registro, con su validación y su valor por defecto. */
export function leerParametroDe<K extends ClaveParametro>(
  db: Ejecutor,
  clave: K,
): Promise<ValorDe<K>> {
  const p = PARAMETROS[clave];
  return leerParametro(
    db,
    clave,
    p.esquema as unknown as z.ZodType<ValorDe<K>>,
    p.porDefecto as ValorDe<K>,
  );
}

/** Valores actuales de todos los parámetros (para la pantalla de SOFTeam). */
export async function leerParametros(db: Ejecutor) {
  const valores = await Promise.all(
    (Object.keys(PARAMETROS) as ClaveParametro[]).map(
      async (clave) => [clave, await leerParametroDe(db, clave)] as const,
    ),
  );
  return Object.fromEntries(valores) as { [K in ClaveParametro]: ValorDe<K> };
}

/** Texto del formulario al valor del parámetro ("5, 15" → [5, 15]; "on" → true). */
function interpretar(clave: ClaveParametro, texto: string): unknown {
  const tipo = PARAMETROS[clave].tipo;
  if (tipo === "booleano") return texto === "on" || texto === "true";
  if (tipo === "numero") return /^\s*\d+\s*$/.test(texto) ? Number(texto) : Number.NaN;
  return texto
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((v) => (/^\d+$/.test(v) ? Number(v) : Number.NaN));
}

/** Guarda un parámetro validado (Administración). Devuelve el error para mostrar. */
export async function guardarParametro(
  db: Db,
  clave: ClaveParametro,
  texto: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = PARAMETROS[clave];
  const valor = (p.esquema as z.ZodType).safeParse(interpretar(clave, texto));
  if (!valor.success) {
    return { ok: false, error: valor.error.issues[0]?.message ?? "Valor inválido." };
  }
  return db.transaction(async (tx) => {
    const antes = await tx.query.parametros.findFirst({ where: eq(t.parametros.clave, clave) });
    await tx
      .insert(t.parametros)
      .values({ clave, valor: valor.data, descripcion: p.ayuda })
      .onConflictDoUpdate({ target: t.parametros.clave, set: { valor: valor.data } });
    await auditar(tx, {
      actorId,
      entidad: "parametro",
      entidadId: clave,
      accion: "modificacion",
      antes: { valor: antes?.valor ?? p.porDefecto },
      despues: { valor: valor.data },
    });
    return { ok: true };
  });
}
