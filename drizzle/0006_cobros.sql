ALTER TABLE "ordenes" ALTER COLUMN "mp_pago_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "ordenes" ADD COLUMN "link_pago_url" text;--> statement-breakpoint
ALTER TABLE "ordenes" ADD COLUMN "factura_numero" varchar(40);--> statement-breakpoint
ALTER TABLE "ordenes" ADD COLUMN "facturacion_iniciada_en" timestamp with time zone;