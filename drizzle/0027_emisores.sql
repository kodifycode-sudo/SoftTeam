-- Emisores: sociedades de SOFTeam que facturan. El cliente
-- tiene uno (o usa el preferido de su país) y la orden lo congela con su CUIT.
CREATE TABLE "emisores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razon_social" varchar(120) NOT NULL,
	"cuit" char(11) NOT NULL,
	"condicion_iva" varchar(30) NOT NULL,
	"domicilio_fiscal" varchar(160) NOT NULL,
	"pais_id" char(2) NOT NULL,
	"punto_venta" smallint,
	"preferido" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"xubio" boolean DEFAULT false NOT NULL,
	"xubio_client_id" varchar(100),
	"xubio_secreto_cifrado" text,
	"xubio_punto_venta_id" integer,
	"xubio_producto_id" integer,
	"xubio_centro_costo_id" integer,
	"mercado_pago" boolean DEFAULT false NOT NULL,
	"mp_access_token_cifrado" text,
	"mp_secreto_avisos_cifrado" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "emisor_id" uuid;--> statement-breakpoint
ALTER TABLE "ordenes" ADD COLUMN "emisor_id" uuid;--> statement-breakpoint
ALTER TABLE "ordenes" ADD COLUMN "emisor_cuit" char(11);--> statement-breakpoint
ALTER TABLE "ordenes" ADD COLUMN "emisor_razon_social" varchar(120);--> statement-breakpoint
ALTER TABLE "emisores" ADD CONSTRAINT "emisores_condicion_iva_condiciones_iva_codigo_fk" FOREIGN KEY ("condicion_iva") REFERENCES "public"."condiciones_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emisores" ADD CONSTRAINT "emisores_pais_id_paises_id_fk" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emisores_cuit_index" ON "emisores" USING btree ("cuit");--> statement-breakpoint
CREATE UNIQUE INDEX "emisor_preferido_por_pais" ON "emisores" USING btree ("pais_id") WHERE "emisores"."preferido" and "emisores"."activo";--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_emisor_id_emisores_id_fk" FOREIGN KEY ("emisor_id") REFERENCES "public"."emisores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_emisor_id_emisores_id_fk" FOREIGN KEY ("emisor_id") REFERENCES "public"."emisores"("id") ON DELETE no action ON UPDATE no action;