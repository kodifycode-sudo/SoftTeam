-- Tickets: tipo de uso, mínimo, moneda, país, cliente
-- nominado, instancias habilitadas, visibilidad y observaciones. Los existentes
-- conservan su comportamiento: varios usos.
ALTER TABLE "tickets" ADD COLUMN "uso" varchar(18) DEFAULT 'UNICO_X_CLIENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "usos_maximos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "minimo" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "moneda" varchar(3) DEFAULT 'ARS' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "pais_id" char(2);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "alta_inicial" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "adicional" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "renovacion" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "publico" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "observaciones" varchar(500);--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_pais_id_paises_id_fk" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_cliente_id_index" ON "tickets" USING btree ("cliente_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "uso_ticket" CHECK ("tickets"."uso" in ('UNICO_X_CLIENTE', 'UNICO_ABSOLUTO', 'MULTIPLE'));--> statement-breakpoint
UPDATE "tickets" SET "uso" = 'MULTIPLE';
