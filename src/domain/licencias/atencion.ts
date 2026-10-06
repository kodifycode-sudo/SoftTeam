import { diasEntre, type Fecha } from "@/domain/fecha";
import { estadoDeSaldo } from "@/domain/procesos/calendario";

/*
 * Qué de la licencia le conviene mirar al cliente ahora, con los mismos
 * umbrales que las alertas del proceso diario (parámetros
 * `alertas.vencimiento_dias` y `alertas.saldo_bajo_porcentaje`): paquetes
 * que vencen pronto y no se renuevan solos, y cupos o saldos bajos o
 * agotados. Un paquete con renovación automática no pide nada.
 */

export interface VencimientoLicencia {
  paquete: string;
  /** `null`: no vence (se usa hasta agotar el saldo). */
  hasta: Fecha | null;
  /** Tiene renovación automática activa (o la renovación ya está generada). */
  renuevaSolo: boolean;
}

export interface CupoLicencia {
  nombre: string;
  total: number;
  disponible: number;
}

export interface Atencion {
  vencen: { paquete: string; dias: number }[];
  /** Bajos o agotados, los agotados primero. */
  saldosBajos: (CupoLicencia & { agotado: boolean })[];
}

export function pendientesDeAtencion(
  hoy: Fecha,
  vencimientos: readonly VencimientoLicencia[],
  cupos: readonly CupoLicencia[],
  umbrales: { diasAviso: number; porcentajeBajo: number },
): Atencion {
  const vencen = vencimientos
    .filter((v) => v.hasta !== null && !v.renuevaSolo)
    .map((v) => ({ paquete: v.paquete, dias: diasEntre(hoy, v.hasta as Fecha) }))
    .filter((v) => v.dias >= 0 && v.dias <= umbrales.diasAviso)
    .sort((a, b) => a.dias - b.dias);
  const saldosBajos = cupos
    .map((c) => ({ ...c, estado: estadoDeSaldo(c.total, c.disponible, umbrales.porcentajeBajo) }))
    .filter((c) => c.estado !== "NORMAL")
    .map(({ estado, ...c }) => ({ ...c, agotado: estado === "AGOTADO" }))
    .sort((a, b) => Number(b.agotado) - Number(a.agotado));
  return { vencen, saldosBajos };
}
