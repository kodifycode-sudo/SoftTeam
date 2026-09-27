CREATE TYPE "public"."estado_solicitud" AS ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA');--> statement-breakpoint
ALTER TYPE "public"."tipo_alerta" ADD VALUE 'FACTURACION_SOLICITADA';--> statement-breakpoint
ALTER TYPE "public"."tipo_alerta" ADD VALUE 'FACTURACION_RESUELTA';--> statement-breakpoint
CREATE TABLE "solicitudes_facturacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"oficina_id" uuid NOT NULL,
	"cuit" char(11),
	"comentario" varchar(300),
	"estado" "estado_solicitud" DEFAULT 'PENDIENTE' NOT NULL,
	"solicitado_por_id" text NOT NULL,
	"resuelto_por_id" text,
	"resuelto_en" timestamp with time zone,
	"respuesta" varchar(300),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solicitudes_facturacion" ADD CONSTRAINT "solicitudes_facturacion_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_facturacion" ADD CONSTRAINT "solicitudes_facturacion_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_facturacion" ADD CONSTRAINT "solicitudes_facturacion_solicitado_por_id_usuarios_id_fk" FOREIGN KEY ("solicitado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_facturacion" ADD CONSTRAINT "solicitudes_facturacion_resuelto_por_id_usuarios_id_fk" FOREIGN KEY ("resuelto_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "solicitud_pendiente_por_oficina" ON "solicitudes_facturacion" USING btree ("oficina_id") WHERE "solicitudes_facturacion"."estado" = 'PENDIENTE';--> statement-breakpoint
CREATE INDEX "solicitudes_facturacion_empresa_id_estado_index" ON "solicitudes_facturacion" USING btree ("empresa_id","estado");