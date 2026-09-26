CREATE TYPE "public"."estado_incidente" AS ENUM('ABIERTO', 'EN_CURSO', 'ESPERANDO_CLIENTE', 'RESUELTO', 'CERRADO');--> statement-breakpoint
CREATE TYPE "public"."prioridad_incidente" AS ENUM('BAJA', 'MEDIA', 'ALTA');--> statement-breakpoint
ALTER TYPE "public"."tipo_alerta" ADD VALUE 'SOPORTE_RESPUESTA';--> statement-breakpoint
CREATE TABLE "incidente_mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incidente_id" uuid NOT NULL,
	"autor_id" text NOT NULL,
	"de_softeam" boolean NOT NULL,
	"interno" boolean DEFAULT false NOT NULL,
	"texto" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "incidentes_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"empresa_id" uuid NOT NULL,
	"creado_por_id" text NOT NULL,
	"producto" varchar(20) NOT NULL,
	"asunto" varchar(140) NOT NULL,
	"prioridad" "prioridad_incidente" DEFAULT 'MEDIA' NOT NULL,
	"estado" "estado_incidente" DEFAULT 'ABIERTO' NOT NULL,
	"asignado_a_id" text,
	"consumo_id" uuid,
	"ultima_actividad_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marcas_empresa" (
	"empresa_id" uuid PRIMARY KEY NOT NULL,
	"nombre_comercial" varchar(80),
	"eslogan" varchar(120),
	"color_primario" varchar(7),
	"color_secundario" varchar(7),
	"logo" "bytea",
	"logo_tipo" varchar(30),
	"logo_hash" varchar(64),
	"texto_bienvenida" varchar(500),
	"firma_mail" varchar(300),
	"web" varchar(160),
	"email" varchar(160),
	"telefono" varchar(30),
	"whatsapp" varchar(30),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "notas_internas" text;--> statement-breakpoint
ALTER TABLE "auditoria" ADD COLUMN "empresa_id" uuid;--> statement-breakpoint
ALTER TABLE "incidente_mensajes" ADD CONSTRAINT "incidente_mensajes_incidente_id_incidentes_id_fk" FOREIGN KEY ("incidente_id") REFERENCES "public"."incidentes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidente_mensajes" ADD CONSTRAINT "incidente_mensajes_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_creado_por_id_usuarios_id_fk" FOREIGN KEY ("creado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_asignado_a_id_usuarios_id_fk" FOREIGN KEY ("asignado_a_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_consumo_id_consumos_id_fk" FOREIGN KEY ("consumo_id") REFERENCES "public"."consumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcas_empresa" ADD CONSTRAINT "marcas_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidente_mensajes_incidente_id_creado_en_index" ON "incidente_mensajes" USING btree ("incidente_id","creado_en");--> statement-breakpoint
CREATE INDEX "incidentes_empresa_id_estado_index" ON "incidentes" USING btree ("empresa_id","estado");--> statement-breakpoint
CREATE INDEX "incidentes_estado_ultima_actividad_en_index" ON "incidentes" USING btree ("estado","ultima_actividad_en");--> statement-breakpoint
CREATE INDEX "incidentes_numero_index" ON "incidentes" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "auditoria_empresa_id_en_index" ON "auditoria" USING btree ("empresa_id","en");