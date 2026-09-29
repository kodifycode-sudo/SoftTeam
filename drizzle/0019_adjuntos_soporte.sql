CREATE TABLE "incidente_adjuntos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mensaje_id" uuid NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"tipo" varchar(40) NOT NULL,
	"tamano" integer NOT NULL,
	"contenido" "bytea" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidente_adjuntos" ADD CONSTRAINT "incidente_adjuntos_mensaje_id_incidente_mensajes_id_fk" FOREIGN KEY ("mensaje_id") REFERENCES "public"."incidente_mensajes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidente_adjuntos_mensaje_id_index" ON "incidente_adjuntos" USING btree ("mensaje_id");