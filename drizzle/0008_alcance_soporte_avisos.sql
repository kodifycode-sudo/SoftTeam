ALTER TABLE "alertas" ADD COLUMN "canal_id" uuid;--> statement-breakpoint
ALTER TABLE "alertas" ADD COLUMN "oficina_id" uuid;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN "canal_id" uuid;--> statement-breakpoint
ALTER TABLE "incidentes" ADD COLUMN "oficina_id" uuid;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_canal_id_canales_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_canal_id_canales_id_fk" FOREIGN KEY ("canal_id") REFERENCES "public"."canales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidentes" ADD CONSTRAINT "incidentes_oficina_id_oficinas_id_fk" FOREIGN KEY ("oficina_id") REFERENCES "public"."oficinas"("id") ON DELETE no action ON UPDATE no action;