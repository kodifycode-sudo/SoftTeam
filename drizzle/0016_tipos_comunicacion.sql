CREATE TABLE "tipos_comunicacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" smallint NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"medios" jsonb NOT NULL,
	"reglas" jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tipos_comunicacion" ADD CONSTRAINT "tipos_comunicacion_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_comunicacion_empresa_id_codigo_index" ON "tipos_comunicacion" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_comunicacion_empresa_id_nombre_index" ON "tipos_comunicacion" USING btree ("empresa_id","nombre");