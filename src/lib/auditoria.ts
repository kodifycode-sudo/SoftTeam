/*
 * Nombres legibles de la auditoría: los usan la pantalla de auditoría y el
 * histórico de actividad de cada empresa.
 */

export const ENTIDADES_AUDITORIA: Record<string, string> = {
  colaborador: "Usuario de empresa",
  empresa_aseguradora: "Aseguradora de empresa",
  aseguradora: "Aseguradora (catálogo)",
  productor: "Productor",
  politicas: "Políticas",
  oficina: "Oficina",
  orden: "Orden",
  paquete: "Paquete",
  medio_pago: "Medio de pago",
  usuario_softeam: "Usuario SOFTeam",
  sistema_api: "Sistema integrado",
  cliente: "Cliente",
  empresa: "Empresa",
  importacion: "Importación de datos",
  grupo: "Grupo económico",
  canal: "Canal",
  parametro: "Parámetro del sistema",
  medio_envio: "Medio de envío",
  usuario: "Usuario",
  contrato: "Contrato",
  proceso: "Proceso",
  ticket: "Ticket de descuento",
  incidente: "Pedido de soporte",
  marca: "Marca",
  notas: "Notas de SOFTeam",
  alerta: "Alerta",
};

export const ACCIONES_AUDITORIA: Record<string, string> = {
  alta: "Alta",
  alta_en_linea: "Alta en línea",
  baja: "Baja",
  modificacion: "Modificación",
  reactivacion: "Reactivación",
  activar: "Activación",
  inactivar: "Inactivación",
  cambio_rol: "Cambio de rol",
  codigo_alta: "Alta de código",
  facturacion: "Cambio de facturación",
  importacion: "Importación",
  miembro_alta: "Suma un cliente",
  miembro_baja: "Saca un cliente",
  bonificacion: "Bonificación",
  "2fa_activado": "Activó la verificación en dos pasos",
  "2fa_desactivado": "Desactivó la verificación en dos pasos",
  "2fa_codigos": "Regeneró los códigos de respaldo",
  "2fa_quitado": "Le quitaron la verificación en dos pasos",
  facturacion_pedido: "Pedido de facturación",
  facturacion_aprobada: "Facturación aprobada",
  facturacion_rechazada: "Facturación rechazada",
  codigo_baja: "Baja de código",
  confirmar: "Confirmación",
  cancelar: "Cancelación",
  registrar_pago: "Pago registrado",
  rotar_secreto: "Secreto rotado",
  renovacion: "Renovación generada",
  vencer_excepcion: "Excepción de pago vencida",
  ejecutar: "Ejecución manual",
  descartar: "Descarte",
  reenviar_link: "Link de pago reenviado",
  pago_rechazado: "Pago rechazado",
  facturar: "Factura emitida",
  revisada: "Revisión cerrada",
  asignar: "Asignación",
  estado_abierto: "Reabierto",
  estado_en_curso: "En curso",
  estado_esperando_cliente: "Esperando al cliente",
  estado_resuelto: "Resuelto",
  estado_cerrado: "Cerrado",
  no_renovar: "Renovación automática desactivada",
  renovar: "Renovación automática activada",
  interfaz_prodigal_alta: "Alta de interfaz Prodigal",
  interfaz_prodigal_baja: "Baja de interfaz Prodigal",
  interfaz_cotiweb_alta: "Alta de interfaz CotiWeb",
  interfaz_cotiweb_baja: "Baja de interfaz CotiWeb",
};

export const accionLegible = (accion: string) =>
  ACCIONES_AUDITORIA[accion] ?? accion.replaceAll("_", " ");

/** Nombre del registro, si el cambio lo trae (más fácil de reconocer que el id). */
export function nombreDe(antes: unknown, despues: unknown): string | undefined {
  for (const valor of [despues, antes]) {
    if (valor && typeof valor === "object") {
      const { nombre, email } = valor as { nombre?: unknown; email?: unknown };
      if (typeof nombre === "string") return nombre;
      if (typeof email === "string") return email;
    }
  }
  return undefined;
}
