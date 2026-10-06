import { fechaCorta } from "@/lib/formato";

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
  tipo_comunicacion: "Tipo de comunicación",
  moneda: "Moneda",
  pais: "País",
  provincia: "Provincia",
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

/** Campos técnicos que no aportan al leer un cambio. */
const CAMPOS_OMITIDOS = new Set(["actualizadoEn", "updatedAt", "creadoEn", "createdAt"]);

const ISO_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Palabras de los nombres de campo que llevan tilde, siglas o nombre propio. */
const PALABRAS: Record<string, string> = {
  codigo: "código",
  numero: "número",
  telefono: "teléfono",
  razon: "razón",
  condicion: "condición",
  direccion: "dirección",
  matricula: "matrícula",
  ultima: "última",
  ultimo: "último",
  periodo: "período",
  bonificacion: "bonificación",
  renovacion: "renovación",
  generacion: "generación",
  descripcion: "descripción",
  comunicacion: "comunicación",
  notificacion: "notificación",
  prodigal: "Prodigal",
  cotiweb: "CotiWeb",
  bienseguro: "BienSeguro",
  iva: "IVA",
  cuit: "CUIT",
  id: "id",
};

/** "interfazProdigalBajaDesde" → "Interfaz Prodigal baja desde". */
export function campoLegible(campo: string): string {
  const texto = campo
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .split(" ")
    .map((palabra) => PALABRAS[palabra] ?? palabra)
    .join(" ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Valor de un campo como texto corto: Sí/No, —, fechas legibles, objetos en JSON. */
export function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "string" && ISO_FECHA_HORA.test(valor)) {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(valor));
  }
  if (typeof valor === "string" && ISO_FECHA.test(valor)) return fechaCorta(valor);
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

export interface Diferencia {
  campo: string;
  antes: string;
  despues: string;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Campos que cambiaron entre `antes` y `despues`. En un alta (sin antes) o
 * una baja (sin después) lista los campos con valor del lado que existe.
 */
export function diferencias(antes: unknown, despues: unknown): Diferencia[] {
  const a = esObjeto(antes) ? antes : {};
  const d = esObjeto(despues) ? despues : {};
  const campos = [...new Set([...Object.keys(a), ...Object.keys(d)])];
  return campos
    .filter((c) => !CAMPOS_OMITIDOS.has(c))
    .filter((c) => JSON.stringify(a[c] ?? null) !== JSON.stringify(d[c] ?? null))
    .map((c) => ({
      campo: campoLegible(c),
      antes: valorLegible(a[c]),
      despues: valorLegible(d[c]),
    }));
}
