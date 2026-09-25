CREATE TYPE "public"."clase_recurso" AS ENUM('CAPACIDAD', 'FUNCION', 'CUPO_MENSUAL', 'SALDO');--> statement-breakpoint
CREATE TYPE "public"."condicion_iva" AS ENUM('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL');--> statement-breakpoint
CREATE TYPE "public"."estado_alerta" AS ENUM('PENDIENTE', 'ENVIADA', 'ERROR', 'DESCARTADA');--> statement-breakpoint
CREATE TYPE "public"."estado_contrato" AS ENUM('PEND_PAGO', 'PEND_PAGO_ACTIVO', 'ACTIVO', 'CANCELADO', 'BAJA');--> statement-breakpoint
CREATE TYPE "public"."estado_evento" AS ENUM('PENDIENTE', 'ENTREGADO', 'FALLIDO');--> statement-breakpoint
CREATE TYPE "public"."estado_job" AS ENUM('EN_CURSO', 'OK', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."estado_orden" AS ENUM('PEND_PAGO', 'PAGADA', 'CANCELADA');--> statement-breakpoint
CREATE TYPE "public"."rol_productor" AS ENUM('PRODUCTOR', 'ORGANIZADOR');--> statement-breakpoint
CREATE TYPE "public"."rol_softeam" AS ENUM('SOPORTE', 'COMERCIAL', 'ADMINISTRACION');--> statement-breakpoint
CREATE TYPE "public"."tipo_accion" AS ENUM('ALTA', 'RENOVACION');--> statement-breakpoint
CREATE TYPE "public"."tipo_alerta" AS ENUM('VENCIMIENTO_15D', 'VENCIMIENTO_7D', 'VENCIMIENTO_1D', 'SALDO_BAJO', 'SALDO_AGOTADO', 'PLAZO_PAGO_POR_VENCER', 'LICENCIA_VENCIDA', 'EMPRESA_SIN_PAQUETE', 'LIMITE_EXCEDIDO', 'PAGO_RECHAZADO', 'LINK_PAGO_REENVIADO');--> statement-breakpoint
CREATE TYPE "public"."tipo_cliente" AS ENUM('DIRECTO', 'CORPORATIVO');--> statement-breakpoint
CREATE TYPE "public"."tipo_comprobante" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."tipo_generacion" AS ENUM('MANUAL', 'RENOVACION');--> statement-breakpoint
CREATE TYPE "public"."tipo_instalacion" AS ENUM('SAAS', 'ON_PREMISE');--> statement-breakpoint
CREATE TYPE "public"."tipo_medio_pago" AS ENUM('TRANSFERENCIA', 'LINK_MP', 'SUSCRIPCION_MP', 'PLANILLA');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('CARGA', 'CONSUMO', 'AJUSTE');--> statement-breakpoint
CREATE TYPE "public"."tipo_paquete" AS ENUM('TEMPORAL', 'CONSUMIBLE');--> statement-breakpoint
CREATE TYPE "public"."tipo_persona" AS ENUM('FISICA', 'JURIDICA');--> statement-breakpoint
CREATE TABLE "alternativas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paquete_id" uuid NOT NULL,
	"nombre" varchar(40) NOT NULL,
	"meses" smallint,
	"precio_compra" numeric(14, 2) NOT NULL,
	"precio_renovacion" numeric(14, 2) NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meses_positivos" CHECK ("alternativas"."meses" is null or "alternativas"."meses" > 0),
	CONSTRAINT "precios_no_negativos" CHECK ("alternativas"."precio_compra" >= 0 and "alternativas"."precio_renovacion" >= 0)
);
--> statement-breakpoint
CREATE TABLE "medios_envio" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"nombre" varchar(40) NOT NULL,
	"factor_centesimos" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "factor_positivo" CHECK ("medios_envio"."factor_centesimos" > 0)
);
--> statement-breakpoint
CREATE TABLE "medios_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"tipo" "tipo_medio_pago" NOT NULL,
	"pais_id" char(2),
	"ajuste_porcentaje" numeric(7, 2) DEFAULT 0 NOT NULL,
	"habilitado_alta" boolean DEFAULT true NOT NULL,
	"habilitado_adicional" boolean DEFAULT true NOT NULL,
	"habilitado_renovacion" boolean DEFAULT true NOT NULL,
	"genera_link" boolean DEFAULT false NOT NULL,
	"planilla" boolean DEFAULT false NOT NULL,
	"instrucciones" text,
	"orden" smallint DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medios_pago_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "ajuste_rango" CHECK ("medios_pago"."ajuste_porcentaje" > -100 and "medios_pago"."ajuste_porcentaje" <= 100)
);
--> statement-breakpoint
CREATE TABLE "paquete_recursos" (
	"paquete_id" uuid NOT NULL,
	"recurso_id" varchar(60) NOT NULL,
	"cantidad" integer NOT NULL,
	CONSTRAINT "paquete_recursos_paquete_id_recurso_id_pk" PRIMARY KEY("paquete_id","recurso_id"),
	CONSTRAINT "cantidad_no_negativa" CHECK ("paquete_recursos"."cantidad" >= 0)
);
--> statement-breakpoint
CREATE TABLE "paquetes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"descripcion" text,
	"pais_id" char(2) NOT NULL,
	"tipo" "tipo_paquete" NOT NULL,
	"privado" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"venta_desde" date NOT NULL,
	"venta_hasta" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paquetes_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "venta_rango" CHECK ("paquetes"."venta_hasta" is null or "paquetes"."venta_hasta" >= "paquetes"."venta_desde")
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recursos" (
	"id" varchar(60) PRIMARY KEY NOT NULL,
	"producto_id" varchar(30) NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"clase" "clase_recurso" NOT NULL,
	"unidad" varchar(20),
	"orden" smallint DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_paquetes" (
	"ticket_id" uuid NOT NULL,
	"paquete_id" uuid NOT NULL,
	CONSTRAINT "ticket_paquetes_ticket_id_paquete_id_pk" PRIMARY KEY("ticket_id","paquete_id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"descripcion" varchar(200),
	"porcentaje" numeric(7, 2) NOT NULL,
	"tope" numeric(14, 2) NOT NULL,
	"vigente_desde" date NOT NULL,
	"vigente_hasta" date NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "porcentaje_rango" CHECK ("tickets"."porcentaje" > 0 and "tickets"."porcentaje" <= 100),
	CONSTRAINT "vigencia_rango" CHECK ("tickets"."vigente_hasta" >= "tickets"."vigente_desde")
);
--> statement-breakpoint
CREATE TABLE "aseguradoras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pais_id" char(2) NOT NULL,
	"codigo_legal" varchar(10),
	"nombre" varchar(80) NOT NULL,
	"abreviatura" varchar(10) NOT NULL,
	"interfaz_prodigal_disponible" boolean DEFAULT false NOT NULL,
	"interfaz_cotiweb_disponible" boolean DEFAULT false NOT NULL,
	"interfaz_documentos_disponible" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "colaboradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"iniciales" varchar(5),
	"email" varchar(160) NOT NULL,
	"telefono" varchar(30),
	"canal_id" uuid,
	"oficina_id" uuid,
	"admin_general" boolean DEFAULT false NOT NULL,
	"admin_comercial" boolean DEFAULT false NOT NULL,
	"admin_operativo" boolean DEFAULT false NOT NULL,
	"acceso_prodigal" boolean DEFAULT false NOT NULL,
	"acceso_cotiweb" boolean DEFAULT false NOT NULL,
	"acceso_bienseguro" boolean DEFAULT false NOT NULL,
	"acceso_boletin" boolean DEFAULT false NOT NULL,
	"usuario_prodigal" varchar(20),
	"usuario_id" varchar(64),
	"activo" boolean DEFAULT true NOT NULL,
	"alta_fecha" date DEFAULT now() NOT NULL,
	"baja_fecha" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresa_aseguradoras" (
	"empresa_id" uuid NOT NULL,
	"aseguradora_id" uuid NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"interfaz_prodigal" boolean DEFAULT false NOT NULL,
	"interfaz_cotiweb" boolean DEFAULT false NOT NULL,
	"interfaz_baja_desde" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresa_aseguradoras_empresa_id_aseguradora_id_pk" PRIMARY KEY("empresa_id","aseguradora_id")
);
--> statement-breakpoint
CREATE TABLE "politicas_empresa" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"politicas" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productor_codigos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"productor_id" uuid NOT NULL,
	"aseguradora_id" uuid NOT NULL,
	"codigo" varchar(20) NOT NULL,
	"rol" "rol_productor" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"oficina_id" uuid,
	"nombre" varchar(120) NOT NULL,
	"matricula" varchar(20),
	"tipo_persona" "tipo_persona",
	"cuit" char(11),
	"condicion_iva" "condicion_iva",
	"email" varchar(160),
	"telefono" varchar(30),
	"celular" varchar(30),
	"domicilio" varchar(160),
	"agente_institorio" boolean DEFAULT false NOT NULL,
	"es_productor" boolean DEFAULT true NOT NULL,
	"es_organizador" boolean DEFAULT false NOT NULL,
	"es_subproductor" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"oficina_id" uuid,
	"familia" varchar(30) NOT NULL,
	"sistema" varchar(30) NOT NULL,
	"transaccion_externa" varchar(80) NOT NULL,
	"medio_envio_id" varchar(20),
	"cantidad" integer NOT NULL,
	"factor_centesimos" integer NOT NULL,
	"creditos_solicitados" integer NOT NULL,
	"creditos_consumidos" integer NOT NULL,
	"concepto" varchar(200),
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_saldo" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movimientos_saldo_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"contrato_id" uuid NOT NULL,
	"recurso_id" varchar(60) NOT NULL,
	"clase" "clase_recurso" NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"creditos" integer NOT NULL,
	"periodo" char(7),
	"consumo_id" uuid,
	"observacion" varchar(200),
	"registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clase_consumible" CHECK ("movimientos_saldo"."clase" in ('CUPO_MENSUAL', 'SALDO')),
	CONSTRAINT "periodo_segun_clase" CHECK (("movimientos_saldo"."clase" = 'CUPO_MENSUAL') = ("movimientos_saldo"."periodo" is not null)),
	CONSTRAINT "signo_segun_tipo" CHECK ("movimientos_saldo"."tipo" = 'AJUSTE' or ("movimientos_saldo"."tipo" = 'CARGA') = ("movimientos_saldo"."creditos" > 0))
);
--> statement-breakpoint
CREATE TABLE "canales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" char(2) NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "clientes_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"tipo_persona" "tipo_persona" NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"tipo_sociedad" varchar(10),
	"nombre_factura" varchar(120) NOT NULL,
	"cuit" char(11) NOT NULL,
	"condicion_iva" "condicion_iva" NOT NULL,
	"domicilio_fiscal" jsonb NOT NULL,
	"domicilio_comercial" jsonb,
	"contacto_administrador" jsonb NOT NULL,
	"contacto_pagos" jsonb,
	"contacto_comercial" jsonb,
	"grupo_id" uuid,
	"medio_pago_alta_id" uuid,
	"medio_pago_renovacion_id" uuid,
	"xubio_id" varchar(40),
	"observaciones" text,
	"observacion_factura" varchar(200),
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "empresas_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 2000 CACHE 1),
	"cliente_id" uuid NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"nombre_corto" varchar(20) NOT NULL,
	"pais_id" char(2) NOT NULL,
	"tipo_cliente" "tipo_cliente" DEFAULT 'DIRECTO' NOT NULL,
	"tipo_instalacion" "tipo_instalacion" DEFAULT 'SAAS' NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"modificada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grupos_economicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"nombre_corto" varchar(20) NOT NULL,
	"cliente_facturacion_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupos_economicos_nombreCorto_unique" UNIQUE("nombre_corto")
);
--> statement-breakpoint
CREATE TABLE "oficinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"codigo" char(3) NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"telefono" varchar(30),
	"whatsapp" varchar(30),
	"domicilio" varchar(160),
	"redes" jsonb,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paises" (
	"id" char(2) PRIMARY KEY NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"prefijo_telefonico" varchar(5) NOT NULL,
	"moneda" char(3) NOT NULL,
	"alicuota_iva_general" numeric(7, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"contrato_id" uuid,
	"orden_id" uuid,
	"tipo" "tipo_alerta" NOT NULL,
	"clave_deduplicacion" varchar(160) NOT NULL,
	"mensaje" varchar(300) NOT NULL,
	"para_cliente" boolean DEFAULT true NOT NULL,
	"para_softeam" boolean DEFAULT true NOT NULL,
	"estado" "estado_alerta" DEFAULT 'PENDIENTE' NOT NULL,
	"generada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"enviada_en" timestamp with time zone,
	"leida_en" timestamp with time zone,
	"error" varchar(300)
);
--> statement-breakpoint
CREATE TABLE "api_clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sistema" varchar(30) NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"secreto_cifrado" text NOT NULL,
	"webhook_url" varchar(300),
	"activo" boolean DEFAULT true NOT NULL,
	"ultimo_uso_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_clientes_sistema_unique" UNIQUE("sistema")
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" varchar(64),
	"actor_tipo" varchar(40) NOT NULL,
	"entidad" varchar(40) NOT NULL,
	"entidad_id" varchar(64) NOT NULL,
	"accion" varchar(40) NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"motivo" varchar(300),
	"en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_salida" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "eventos_salida_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tipo" varchar(60) NOT NULL,
	"destino" varchar(30) NOT NULL,
	"payload" jsonb NOT NULL,
	"estado" "estado_evento" DEFAULT 'PENDIENTE' NOT NULL,
	"intentos" smallint DEFAULT 0 NOT NULL,
	"proximo_intento_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_error" varchar(500),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"entregado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" varchar(40) NOT NULL,
	"clave" varchar(40) NOT NULL,
	"estado" "estado_job" DEFAULT 'EN_CURSO' NOT NULL,
	"iniciado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_en" timestamp with time zone,
	"resumen" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "parametros" (
	"clave" varchar(60) PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"descripcion" varchar(300) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carrito_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"oficina_id" uuid,
	"alternativa_id" uuid NOT NULL,
	"tipo_accion" "tipo_accion" DEFAULT 'ALTA' NOT NULL,
	"contrato_anterior_id" uuid,
	"cantidad" smallint DEFAULT 1 NOT NULL,
	"agregado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cantidad_positiva" CHECK ("carrito_items"."cantidad" between 1 and 999)
);
--> statement-breakpoint
CREATE TABLE "contrato_recursos" (
	"contrato_id" uuid NOT NULL,
	"recurso_id" varchar(60) NOT NULL,
	"clase" "clase_recurso" NOT NULL,
	"cantidad" integer NOT NULL,
	CONSTRAINT "contrato_recursos_contrato_id_recurso_id_pk" PRIMARY KEY("contrato_id","recurso_id"),
	CONSTRAINT "cantidad_no_negativa" CHECK ("contrato_recursos"."cantidad" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contratos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"oficina_id" uuid,
	"paquete_id" uuid NOT NULL,
	"alternativa_id" uuid NOT NULL,
	"orden_id" uuid NOT NULL,
	"contrato_anterior_id" uuid,
	"tipo_accion" "tipo_accion" NOT NULL,
	"tipo_paquete" "tipo_paquete" NOT NULL,
	"cantidad" smallint NOT NULL,
	"meses" smallint,
	"estado" "estado_contrato" NOT NULL,
	"desde" date,
	"hasta" date,
	"pend_pago_activo_hasta" date,
	"precio_lista" numeric(14, 2) NOT NULL,
	"bonif_porcentaje" numeric(7, 2) DEFAULT 0 NOT NULL,
	"bonif_recurrente" boolean DEFAULT false NOT NULL,
	"bonif_motivo" varchar(200),
	"precio_final" numeric(14, 2) NOT NULL,
	"no_renovar" boolean DEFAULT false NOT NULL,
	"activado_en" timestamp with time zone,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodo_valido" CHECK ("contratos"."hasta" is null or "contratos"."desde" is null or "contratos"."hasta" >= "contratos"."desde"),
	CONSTRAINT "cantidad_positiva" CHECK ("contratos"."cantidad" >= 1),
	CONSTRAINT "bonif_rango" CHECK ("contratos"."bonif_porcentaje" >= 0 and "contratos"."bonif_porcentaje" <= 100),
	CONSTRAINT "consumible_sin_vencimiento" CHECK ("contratos"."tipo_paquete" = 'TEMPORAL' or ("contratos"."meses" is null and "contratos"."hasta" is null))
);
--> statement-breakpoint
CREATE TABLE "orden_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orden_id" uuid NOT NULL,
	"contrato_id" uuid NOT NULL,
	"descripcion" varchar(160) NOT NULL,
	"precio_lista" numeric(14, 2) NOT NULL,
	"bonificacion" numeric(14, 2) NOT NULL,
	"precio_final" numeric(14, 2) NOT NULL,
	"total_prorrateado" numeric(14, 2) NOT NULL,
	CONSTRAINT "orden_items_contratoId_unique" UNIQUE("contrato_id")
);
--> statement-breakpoint
CREATE TABLE "ordenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "ordenes_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 10000 CACHE 1),
	"empresa_id" uuid,
	"cliente_id" uuid NOT NULL,
	"cliente_facturacion_id" uuid NOT NULL,
	"medio_pago_id" uuid NOT NULL,
	"estado" "estado_orden" DEFAULT 'PEND_PAGO' NOT NULL,
	"tipo_generacion" "tipo_generacion" DEFAULT 'MANUAL' NOT NULL,
	"orden_origen_id" uuid,
	"agrupada" boolean DEFAULT false NOT NULL,
	"periodo" char(7),
	"moneda" char(3) NOT NULL,
	"condicion_iva" "condicion_iva" NOT NULL,
	"tipo_comprobante" "tipo_comprobante" NOT NULL,
	"subtotal_lista" numeric(14, 2) NOT NULL,
	"bonificacion_total" numeric(14, 2) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"ticket_id" uuid,
	"ticket_porcentaje" numeric(7, 2) DEFAULT 0 NOT NULL,
	"ticket_descuento" numeric(14, 2) DEFAULT 0 NOT NULL,
	"base_neta" numeric(14, 2) NOT NULL,
	"ajuste_pago_porcentaje" numeric(7, 2) NOT NULL,
	"ajuste_pago" numeric(14, 2) NOT NULL,
	"neto_gravado" numeric(14, 2) NOT NULL,
	"alicuota_iva" numeric(7, 2) NOT NULL,
	"iva" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"emitida_en" timestamp with time zone DEFAULT now() NOT NULL,
	"pagada_en" timestamp with time zone,
	"cancelada_en" timestamp with time zone,
	"pago_error" boolean DEFAULT false NOT NULL,
	"pago_error_detalle" varchar(300),
	"pago_error_en" timestamp with time zone,
	"link_reenvios" smallint DEFAULT 0 NOT NULL,
	"mp_preferencia_id" varchar(80),
	"mp_suscripcion_id" varchar(80),
	"mp_pago_id" varchar(80),
	"xubio_comprobante_id" varchar(80),
	"facturada_en" timestamp with time zone,
	"clave_idempotencia" varchar(80),
	"requiere_revision" boolean DEFAULT false NOT NULL,
	"observaciones" text,
	"version" integer DEFAULT 1 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agrupada_sin_empresa" CHECK (not "ordenes"."agrupada" or "ordenes"."empresa_id" is null),
	CONSTRAINT "total_no_negativo" CHECK ("ordenes"."total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "alternativas" ADD CONSTRAINT "alternativas_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medios_pago" ADD CONSTRAINT "medios_pago_pais_id_paises_id_fk" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_recursos" ADD CONSTRAINT "paquete_recursos_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquete_recursos" ADD CONSTRAINT "paquete_recursos_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_pais_id_paises_id_fk" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_paquetes" ADD CONSTRAINT "ticket_paquetes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_paquetes" ADD CONSTRAINT "ticket_paquetes_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aseguradoras" ADD CONSTRAINT "aseguradoras_pais_id_paises_id_fk" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_canal_id_canales_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_aseguradoras" ADD CONSTRAINT "empresa_aseguradoras_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_aseguradoras" ADD CONSTRAINT "empresa_aseguradoras_aseguradora_id_aseguradoras_id_fk" FOREIGN KEY ("aseguradora_id") REFERENCES "public"."aseguradoras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "politicas_empresa" ADD CONSTRAINT "politicas_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productor_codigos" ADD CONSTRAINT "productor_codigos_productor_id_productores_id_fk" FOREIGN KEY ("productor_id") REFERENCES "public"."productores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productor_codigos" ADD CONSTRAINT "productor_codigos_aseguradora_id_aseguradoras_id_fk" FOREIGN KEY ("aseguradora_id") REFERENCES "public"."aseguradoras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productores" ADD CONSTRAINT "productores_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productores" ADD CONSTRAINT "productores_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_medio_envio_id_medios_envio_id_fk" FOREIGN KEY ("medio_envio_id") REFERENCES "public"."medios_envio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "movimientos_saldo_consumo_id_consumos_id_fk" FOREIGN KEY ("consumo_id") REFERENCES "public"."consumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canales" ADD CONSTRAINT "canales_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_grupo_id_grupos_economicos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_economicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_medio_pago_alta_id_medios_pago_id_fk" FOREIGN KEY ("medio_pago_alta_id") REFERENCES "public"."medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_medio_pago_renovacion_id_medios_pago_id_fk" FOREIGN KEY ("medio_pago_renovacion_id") REFERENCES "public"."medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_pais_id_paises_id_fk" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grupos_economicos" ADD CONSTRAINT "grupos_economicos_cliente_facturacion_id_clientes_id_fk" FOREIGN KEY ("cliente_facturacion_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oficinas" ADD CONSTRAINT "oficinas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oficinas" ADD CONSTRAINT "oficinas_canal_id_canales_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_orden_id_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_alternativa_id_alternativas_id_fk" FOREIGN KEY ("alternativa_id") REFERENCES "public"."alternativas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrito_items" ADD CONSTRAINT "carrito_items_contrato_anterior_id_contratos_id_fk" FOREIGN KEY ("contrato_anterior_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_recursos" ADD CONSTRAINT "contrato_recursos_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_recursos" ADD CONSTRAINT "contrato_recursos_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_paquete_id_paquetes_id_fk" FOREIGN KEY ("paquete_id") REFERENCES "public"."paquetes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_alternativa_id_alternativas_id_fk" FOREIGN KEY ("alternativa_id") REFERENCES "public"."alternativas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_orden_id_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_contrato_anterior_id_contratos_id_fk" FOREIGN KEY ("contrato_anterior_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_items" ADD CONSTRAINT "orden_items_orden_id_ordenes_id_fk" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orden_items" ADD CONSTRAINT "orden_items_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_cliente_facturacion_id_clientes_id_fk" FOREIGN KEY ("cliente_facturacion_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_medio_pago_id_medios_pago_id_fk" FOREIGN KEY ("medio_pago_id") REFERENCES "public"."medios_pago"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_orden_origen_id_ordenes_id_fk" FOREIGN KEY ("orden_origen_id") REFERENCES "public"."ordenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alternativas_paquete_id_index" ON "alternativas" USING btree ("paquete_id");--> statement-breakpoint
CREATE INDEX "paquetes_pais_id_activo_index" ON "paquetes" USING btree ("pais_id","activo");--> statement-breakpoint
CREATE UNIQUE INDEX "aseguradoras_pais_id_abreviatura_index" ON "aseguradoras" USING btree ("pais_id","abreviatura");--> statement-breakpoint
CREATE UNIQUE INDEX "colaboradores_empresa_id_email_index" ON "colaboradores" USING btree ("empresa_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "colaboradores_usuario_prodigal_index" ON "colaboradores" USING btree ("usuario_prodigal");--> statement-breakpoint
CREATE INDEX "colaboradores_usuario_id_index" ON "colaboradores" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "productor_codigos_productor_id_aseguradora_id_codigo_index" ON "productor_codigos" USING btree ("productor_id","aseguradora_id","codigo");--> statement-breakpoint
CREATE INDEX "productores_empresa_id_index" ON "productores" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consumos_sistema_transaccion_externa_index" ON "consumos" USING btree ("sistema","transaccion_externa");--> statement-breakpoint
CREATE INDEX "consumos_empresa_id_registrado_en_index" ON "consumos" USING btree ("empresa_id","registrado_en");--> statement-breakpoint
CREATE INDEX "movimientos_saldo_contrato_id_recurso_id_periodo_index" ON "movimientos_saldo" USING btree ("contrato_id","recurso_id","periodo");--> statement-breakpoint
CREATE INDEX "movimientos_saldo_consumo_id_index" ON "movimientos_saldo" USING btree ("consumo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canales_empresa_id_codigo_index" ON "canales" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_numero_index" ON "clientes" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_cuit_index" ON "clientes" USING btree ("cuit");--> statement-breakpoint
CREATE INDEX "clientes_grupo_id_index" ON "clientes" USING btree ("grupo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "empresas_numero_index" ON "empresas" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "empresas_cliente_id_index" ON "empresas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "empresas_modificada_en_index" ON "empresas" USING btree ("modificada_en");--> statement-breakpoint
CREATE UNIQUE INDEX "oficinas_canal_id_codigo_index" ON "oficinas" USING btree ("canal_id","codigo");--> statement-breakpoint
CREATE INDEX "oficinas_empresa_id_index" ON "oficinas" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alertas_clave_deduplicacion_index" ON "alertas" USING btree ("clave_deduplicacion");--> statement-breakpoint
CREATE INDEX "alertas_empresa_id_estado_index" ON "alertas" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "auditoria_entidad_entidad_id_index" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_en_index" ON "auditoria" USING btree ("en");--> statement-breakpoint
CREATE INDEX "eventos_salida_estado_proximo_intento_en_index" ON "eventos_salida" USING btree ("estado","proximo_intento_en");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_job_clave_index" ON "job_runs" USING btree ("job","clave");--> statement-breakpoint
CREATE INDEX "carrito_items_empresa_id_index" ON "carrito_items" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "contratos_empresa_id_estado_index" ON "contratos" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "contratos_orden_id_index" ON "contratos" USING btree ("orden_id");--> statement-breakpoint
CREATE INDEX "contratos_hasta_index" ON "contratos" USING btree ("hasta");--> statement-breakpoint
CREATE UNIQUE INDEX "contratos_renovacion_unica" ON "contratos" USING btree ("contrato_anterior_id") WHERE "contratos"."estado" <> 'CANCELADO';--> statement-breakpoint
CREATE INDEX "orden_items_orden_id_index" ON "orden_items" USING btree ("orden_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_numero_index" ON "ordenes" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "ordenes_clave_idempotencia_index" ON "ordenes" USING btree ("clave_idempotencia");--> statement-breakpoint
CREATE INDEX "ordenes_empresa_id_estado_index" ON "ordenes" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "ordenes_cliente_facturacion_id_estado_index" ON "ordenes" USING btree ("cliente_facturacion_id","estado");--> statement-breakpoint
CREATE INDEX "ordenes_estado_emitida_en_index" ON "ordenes" USING btree ("estado","emitida_en");