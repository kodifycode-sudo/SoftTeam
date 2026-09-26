import { type Fecha, inicioDeMes, sumarDias, sumarMeses } from "../fecha";

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
const ultimoDiaDelMes = (f: Fecha): Fecha => sumarDias(sumarMeses(inicioDeMes(f), 1), -1);
const conDia = (f: Fecha, d: number) => `${f.slice(0, 8)}${String(d).padStart(2, "0")}` as Fecha;

/** Las dos ventanas quincenales de renovación que se generan durante el mes de `mes`. */
function ventanasDelMes(mes: Fecha, diasCorte: readonly [number, number]): VentanaRenovacion[] {
  const objetivo = sumarMeses(inicioDeMes(mes), 1);
  const periodo = objetivo.slice(0, 7);
  return [
    {
      clave: `${periodo}-Q1`,
      desde: objetivo,
      hasta: conDia(objetivo, 15),
      corte: conDia(inicioDeMes(mes), diasCorte[0]),
    },
    {
      clave: `${periodo}-Q2`,
      desde: conDia(objetivo, 16),
      hasta: ultimoDiaDelMes(objetivo),
      corte: conDia(inicioDeMes(mes), diasCorte[1]),
    },
  ];
}

/**
 * Ventanas de renovación que ya deberían haberse generado a la fecha: el
 * primer día de corte del mes renueva los vencimientos del 1 al 15 del mes
 * siguiente y el segundo, los del 16 a fin de mes. Así la orden llega con
 * tiempo para pagar antes del vencimiento.
 *
 * Incluye las del mes anterior: si el proceso no corrió algún día (caída,
 * mantenimiento), la próxima corrida las recupera. Las ya generadas se
 * saltean por su clave.
 */
export function ventanasDeRenovacion(
  hoy: Fecha,
  diasCorte: readonly [number, number] = [5, 15],
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
