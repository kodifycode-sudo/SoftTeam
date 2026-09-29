CREATE TABLE "api_uso" (
	"api_cliente_id" uuid NOT NULL,
	"ventana" timestamp with time zone NOT NULL,
	"pedidos" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_uso_api_cliente_id_ventana_pk" PRIMARY KEY("api_cliente_id","ventana")
);
--> statement-breakpoint
ALTER TABLE "api_clientes" ADD COLUMN "limite_por_minuto" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
ALTER TABLE "api_uso" ADD CONSTRAINT "api_uso_api_cliente_id_api_clientes_id_fk" FOREIGN KEY ("api_cliente_id") REFERENCES "public"."api_clientes"("id") ON DELETE cascade ON UPDATE no action;