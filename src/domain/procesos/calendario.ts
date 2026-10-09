import { type Fecha, inicioDeMes, sumarMeses } from "../fecha";

/*
 * Reglas de calendario de los procesos programados. Funciones puras: el
 * proceso decide qué hacer según la fecha, y cada decisión se puede probar
 * sin base ni reloj.
 */

export interface VentanaRenovacion {
  /** Identifica la corrida ("2026-11-Q1"): reejecutarla no duplica nada. */
  clave: string;
  /** Vencimientos que se renuevan: `hasta` entre estas fechas (inclusive). */
  desde: Fecha;
  hasta: Fecha;
  /** Día en que corresponde generarla. */
  corte: Fecha;
}

const dia = (f: Fecha) => Number(f.slice(8, 10));
const conDia = (f: Fecha, d: number) => `${f.slice(0, 8)}${String(d).padStart(2, "0")}` as Fecha;

/**
 * Las dos corridas del mes de `mes` (Mejora v2.1, 8.2): la del primer día de
 * corte renueva los vencimientos desde el día siguiente hasta el día siguiente
 * al segundo corte (con 2 y 11: del 3 al 12, que incluye los alineados al 10);
 * la del segundo, desde ahí hasta el primer corte del mes siguiente (del 13 al
 * 2, que incluye los alineados al 20). Cubren todos los días del mes.
 */
function ventanasDelMes(mes: Fecha, diasCorte: readonly [number, number]): VentanaRenovacion[] {
  const inicio = inicioDeMes(mes);
  const periodo = inicio.slice(0, 7);
  const [c1, c2] = diasCorte;
  return [
    {
      clave: `${periodo}-C1`,
      desde: conDia(inicio, c1 + 1),
      hasta: conDia(inicio, c2 + 1),
      corte: conDia(inicio, c1),
    },
    {
      clave: `${periodo}-C2`,
      desde: conDia(inicio, c2 + 2),
      hasta: conDia(sumarMeses(inicio, 1), c1),
      corte: conDia(inicio, c2),
    },
  ];
}

/**
 * Corridas de renovación que ya deberían haberse hecho a la fecha. Incluye las
 * del mes anterior: si el proceso no corrió algún día (caída, mantenimiento),
 * la próxima corrida las recupera. Las ya generadas se saltean por su clave.
 */
export function ventanasDeRenovacion(
  hoy: Fecha,
  diasCorte: readonly [number, number] = [2, 11],
): VentanaRenovacion[] {
  const mesAnterior = sumarMeses(inicioDeMes(hoy), -1);
  return [...ventanasDelMes(mesAnterior, diasCorte), ...ventanasDelMes(hoy, diasCorte)].filter(
    (v) => v.corte <= hoy,
  );
}

export type TipoAvisoVencimiento = "VENCIMIENTO_15D" | "VENCIMIENTO_7D" | "VENCIMIENTO_1D";

const TIPOS_VENCIMIENTO: readonly TipoAvisoVencimiento[] = [
  "VENCIMIENTO_15D",
  "VENCIMIENTO_7D",
  "VENCIMIENTO_1D",
];

/**
 * Aviso de vencimiento que corresponde a los días que faltan. Por tramos y no
 * por día exacto: si el proceso no corre un día, el aviso sale al siguiente.
 * Cada tramo se avisa una sola vez (la alerta se deduplica por tramo).
 *
 * `umbrales`: días de anticipación, de mayor a menor (15, 7 y 1).
 */
export function avisoDeVencimiento(
  diasRestantes: number,
  umbrales: readonly [number, number, number] = [15, 7, 1],
): TipoAvisoVencimiento | null {
  if (diasRestantes < 0) return null;
  let tipo: TipoAvisoVencimiento | null = null;
  umbrales.forEach((umbral, i) => {
    if (diasRestantes <= umbral) tipo = TIPOS_VENCIMIENTO[i] ?? null;
  });
  return tipo;
}

export type EstadoSaldo = "NORMAL" | "BAJO" | "AGOTADO";

/** Saldo bajo: queda el porcentaje indicado o menos del total. */
export function estadoDeSaldo(total: number, disponible: number, porcentajeBajo = 20): EstadoSaldo {
  if (total <= 0) return "NORMAL";
  if (disponible <= 0) return "AGOTADO";
  return disponible * 100 <= total * porcentajeBajo ? "BAJO" : "NORMAL";
}

/** ¿Hoy toca enviar recordatorios de cobro? */
export const esDiaDeRecordatorio = (hoy: Fecha, dias: readonly number[]): boolean =>
  dias.includes(dia(hoy));
