/**
 * Contrato público de la API para productos (OpenAPI 3.1). Se sirve en
 * /api/v1/openapi.json. Cambios incompatibles van en una versión nueva (v2).
 */

const problema = {
  description: "Error (RFC 9457)",
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problema" } } },
};

const cabecerasFirma = [
  { $ref: "#/components/parameters/Sistema" },
  { $ref: "#/components/parameters/Timestamp" },
  { $ref: "#/components/parameters/Firma" },
];

const numero = {
  name: "numero",
  in: "path",
  required: true,
  description: "Número de empresa (el que usan los productos).",
  schema: { type: "integer", example: 2001 },
};

export const documentoOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "STLic · API para productos",
    version: "1.0.0",
    description: [
      "API con la que Prodigal, CotiWeb, BienSeguro y el Boletín consultan licencias y configuración, e informan consumos.",
      "",
      "## Autenticación",
      "Cada sistema tiene un identificador y un secreto (lo entrega Administración SOFTeam). Toda petición lleva tres cabeceras:",
      "",
      "- `x-stlic-sistema`: identificador del sistema (`prodigal`).",
      "- `x-stlic-timestamp`: segundos Unix. Se aceptan hasta 5 minutos de diferencia.",
      "- `x-stlic-firma`: `v1=` + HMAC-SHA256 en hex, con el secreto, de este texto (una parte por línea):",
      "",
      "```",
      "MÉTODO",
      "/ruta?con=query",
      "timestamp",
      "sha256 hex del cuerpo (del texto vacío si no hay cuerpo)",
      "```",
      "",
      "## Webhooks",
      'Si el sistema tiene un webhook configurado, STLic le envía `POST` con `{ id, tipo: "empresa.actualizada", empresa, modificadaEn }` cada vez que cambia una empresa (licencia, oficinas, usuarios…), firmado con el mismo esquema. Responder 2xx; ante un error se reintenta con espera creciente. Al recibirlo, volver a leer `/empresas/{numero}` y su licencia.',
    ].join("\n"),
  },
  servers: [{ url: "/api/v1" }],
  components: {
    parameters: {
      Sistema: {
        name: "x-stlic-sistema",
        in: "header",
        required: true,
        schema: { type: "string" },
      },
      Timestamp: {
        name: "x-stlic-timestamp",
        in: "header",
        required: true,
        schema: { type: "string" },
      },
      Firma: {
        name: "x-stlic-firma",
        in: "header",
        required: true,
        schema: { type: "string", pattern: "^v1=[0-9a-f]{64}$" },
      },
    },
    schemas: {
      Problema: {
        type: "object",
        required: ["title", "status"],
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          status: { type: "integer" },
          detail: { type: "string" },
          codigo: { type: "string" },
        },
      },
      EmpresaResumen: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          nombre: { type: "string" },
          activa: { type: "boolean" },
          productos: { type: "array", items: { type: "string" }, example: ["prodigal", "cotiweb"] },
          modificadaEn: { type: "string", format: "date-time" },
        },
      },
      Licencia: {
        type: "object",
        properties: {
          empresa: { type: "integer" },
          nombre: { type: "string" },
          activa: { type: "boolean" },
          fecha: { type: "string", format: "date" },
          proximoVencimiento: { type: ["string", "null"], format: "date" },
          productos: {
            type: "object",
            description:
              "Por producto, cada recurso: número (capacidad), booleano (función habilitada) u objeto { total, disponible } (cupos y saldos).",
            additionalProperties: { type: "object" },
            example: {
              prodigal: { usuarios: 5, polizas: 1500, institorio: true },
              notificaciones: {
                mes: { total: 1000, disponible: 720 },
                saldo: { total: 10000, disponible: 9800 },
              },
            },
          },
        },
      },
      PedidoConsumo: {
        type: "object",
        required: ["familia", "cantidad", "transaccion"],
        properties: {
          familia: { type: "string", enum: ["notificaciones", "cotizaciones"] },
          cantidad: { type: "integer", minimum: 1 },
          medio: {
            type: "string",
            enum: ["mail", "sms", "whatsapp", "app"],
            description: "Solo notificaciones. Por defecto, mail.",
          },
          oficina: {
            type: "string",
            example: "01001",
            description: "Oficina que consume (CCOOO). Sin oficina, consume la empresa.",
          },
          modo: { type: "string", enum: ["TODO_O_NADA", "PARCIAL"], default: "TODO_O_NADA" },
          transaccion: {
            type: "string",
            maxLength: 80,
            description:
              "Identificador único en el sistema que consume. Reenviarlo no vuelve a descontar.",
          },
          concepto: { type: "string", maxLength: 200 },
        },
      },
      ResultadoConsumo: {
        type: "object",
        properties: {
          transaccion: { type: "string" },
          solicitado: {
            type: "integer",
            description: "Créditos pedidos (cantidad × factor del medio).",
          },
          consumido: { type: "integer" },
          factor: { type: "number" },
          completo: { type: "boolean" },
          disponible: {
            type: ["integer", "null"],
            description: "Créditos que quedan (null en un reintento).",
          },
          repetido: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/empresas": {
      get: {
        summary: "Empresas para sincronizar",
        parameters: [
          ...cabecerasFirma,
          {
            name: "modificadasDesde",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          { name: "soloActivas", in: "query", schema: { type: "string", enum: ["1"] } },
        ],
        responses: {
          "200": {
            description: "Empresas",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    empresas: {
                      type: "array",
                      items: { $ref: "#/components/schemas/EmpresaResumen" },
                    },
                  },
                },
              },
            },
          },
          "401": problema,
        },
      },
    },
    "/empresas/{numero}": {
      get: {
        summary: "Estructura completa de la empresa (EmpresaFull_V1)",
        description:
          "Empresa, canales, oficinas, usuarios con sus accesos, aseguradoras, productores con sus códigos y políticas.",
        parameters: [...cabecerasFirma, numero],
        responses: { "200": { description: "EmpresaFull_V1" }, "401": problema, "404": problema },
      },
    },
    "/empresas/{numero}/licencia": {
      get: {
        summary: "Licencia vigente hoy",
        parameters: [...cabecerasFirma, numero],
        responses: {
          "200": {
            description: "Licencia",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Licencia" } } },
          },
          "401": problema,
          "404": problema,
        },
      },
    },
    "/empresas/{numero}/consumos": {
      post: {
        summary: "Informar un consumo",
        description:
          "Descuenta primero del cupo del mes y después del saldo sin vencimiento; una oficina usa lo suyo y después el saldo de la empresa, según sus políticas.",
        parameters: [...cabecerasFirma, numero],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/PedidoConsumo" } },
          },
        },
        responses: {
          "201": {
            description: "Consumo registrado",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ResultadoConsumo" } },
            },
          },
          "200": { description: "Transacción ya procesada: se devuelve el resultado original" },
          "401": problema,
          "403": problema,
          "404": problema,
          "409": problema,
          "422": problema,
        },
      },
    },
  },
} as const;
