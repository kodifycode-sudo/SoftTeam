/** Nombre de cada tipo de alerta, para pantallas del panel y del portal. */
export const ETIQUETA_ALERTA = {
  // Los días de cada aviso son configurables (alertas.vencimiento_dias): la etiqueta
  // dice qué aviso es y el texto, cuántos días faltan.
  VENCIMIENTO_15D: "Primer aviso de vencimiento",
  VENCIMIENTO_7D: "Segundo aviso de vencimiento",
  VENCIMIENTO_1D: "Último aviso de vencimiento",
  SALDO_BAJO: "Saldo bajo",
  SALDO_AGOTADO: "Saldo agotado",
  PLAZO_PAGO_POR_VENCER: "Plazo de pago por vencer",
  LICENCIA_VENCIDA: "Paquete vencido",
  EMPRESA_SIN_PAQUETE: "Sin paquetes vigentes",
  LIMITE_EXCEDIDO: "Límite excedido",
  LICENCIA_POR_BAJAR: "La licencia va a bajar",
  PAGO_RECHAZADO: "Pago rechazado",
  LINK_PAGO_REENVIADO: "Link de pago reenviado",
  TOLERANCIA_PAGO_VENCIDA: "Factura agrupada sin pagar",
  RENOVACION_A_NEGOCIAR: "Renovación a negociar",
  CONSUMIBLE_SIN_SALDO: "Consumible sin saldo",
  RENOVACION_CONSUMIBLE: "Renovación de consumible",
  RENOVACION_GENERADA: "Renovación generada",
  RECORDATORIO_PAGO: "Recordatorio de pago",
  SOPORTE_RESPUESTA: "Respuesta de soporte",
  FACTURACION_SOLICITADA: "Pedido de facturación",
  FACTURACION_RESUELTA: "Facturación de oficina",
} as const;
