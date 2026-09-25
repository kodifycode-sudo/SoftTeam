import { pgEnum } from "drizzle-orm/pg-core";
import { CONDICIONES_IVA } from "@/domain/facturacion/impuestos";
import { ESTADOS_CONTRATO } from "@/domain/licencias/contrato";

export const condicionIva = pgEnum("condicion_iva", CONDICIONES_IVA);
export const tipoPersona = pgEnum("tipo_persona", ["FISICA", "JURIDICA"]);
export const tipoCliente = pgEnum("tipo_cliente", ["DIRECTO", "CORPORATIVO"]);
export const tipoInstalacion = pgEnum("tipo_instalacion", ["SAAS", "ON_PREMISE"]);
export const tipoPaquete = pgEnum("tipo_paquete", ["TEMPORAL", "CONSUMIBLE"]);
export const claseRecurso = pgEnum("clase_recurso", [
  "CAPACIDAD",
  "FUNCION",
  "CUPO_MENSUAL",
  "SALDO",
]);
export const tipoAccion = pgEnum("tipo_accion", ["ALTA", "RENOVACION"]);
export const estadoContrato = pgEnum("estado_contrato", ESTADOS_CONTRATO);
export const estadoOrden = pgEnum("estado_orden", ["PEND_PAGO", "PAGADA", "CANCELADA"]);
export const tipoGeneracion = pgEnum("tipo_generacion", ["MANUAL", "RENOVACION"]);
export const tipoMedioPago = pgEnum("tipo_medio_pago", [
  "TRANSFERENCIA",
  "LINK_MP",
  "SUSCRIPCION_MP",
  "PLANILLA",
]);
export const tipoComprobante = pgEnum("tipo_comprobante", ["A", "B"]);
export const tipoMovimiento = pgEnum("tipo_movimiento", ["CARGA", "CONSUMO", "AJUSTE"]);
export const rolSofteam = pgEnum("rol_softeam", ["SOPORTE", "COMERCIAL", "ADMINISTRACION"]);
export const rolProductor = pgEnum("rol_productor", ["PRODUCTOR", "ORGANIZADOR"]);
export const tipoAlerta = pgEnum("tipo_alerta", [
  "VENCIMIENTO_15D",
  "VENCIMIENTO_7D",
  "VENCIMIENTO_1D",
  "SALDO_BAJO",
  "SALDO_AGOTADO",
  "PLAZO_PAGO_POR_VENCER",
  "LICENCIA_VENCIDA",
  "EMPRESA_SIN_PAQUETE",
  "LIMITE_EXCEDIDO",
  "PAGO_RECHAZADO",
  "LINK_PAGO_REENVIADO",
]);
export const estadoAlerta = pgEnum("estado_alerta", [
  "PENDIENTE",
  "ENVIADA",
  "ERROR",
  "DESCARTADA",
]);
export const estadoJob = pgEnum("estado_job", ["EN_CURSO", "OK", "ERROR"]);
export const estadoEvento = pgEnum("estado_evento", ["PENDIENTE", "ENTREGADO", "FALLIDO"]);
