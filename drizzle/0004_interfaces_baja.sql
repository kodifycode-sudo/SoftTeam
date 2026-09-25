ALTER TABLE "empresa_aseguradoras" ADD COLUMN "interfaz_prodigal_baja_desde" date;--> statement-breakpoint
ALTER TABLE "empresa_aseguradoras" ADD COLUMN "interfaz_cotiweb_baja_desde" date;--> statement-breakpoint
ALTER TABLE "empresa_aseguradoras" DROP COLUMN "interfaz_baja_desde";