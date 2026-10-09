-- Consumibles: reintegros de unidades, resultado de cada pedido y alertas de
-- consumible sin saldo y de renovación por saldo.
ALTER TYPE "public"."tipo_alerta" ADD VALUE 'CONSUMIBLE_SIN_SALDO';--> statement-breakpoint
ALTER TYPE "public"."tipo_alerta" ADD VALUE 'RENOVACION_CONSUMIBLE';--> statement-breakpoint
ALTER TYPE "public"."tipo_movimiento" ADD VALUE 'REINTEGRO';--> statement-breakpoint
ALTER TABLE "movimientos_saldo" DROP CONSTRAINT "signo_segun_tipo";--> statement-breakpoint
ALTER TABLE "consumos" ADD COLUMN "tipo" varchar(10) DEFAULT 'SOLICITUD' NOT NULL;--> statement-breakpoint
ALTER TABLE "consumos" ADD COLUMN "consumo_origen_id" uuid;--> statement-breakpoint
ALTER TABLE "consumos" ADD COLUMN "resultado" varchar(20) DEFAULT 'OK' NOT NULL;--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_consumo_origen_id_consumos_id_fk" FOREIGN KEY ("consumo_origen_id") REFERENCES "public"."consumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consumos_consumo_origen_id_index" ON "consumos" USING btree ("consumo_origen_id");--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "tipo_consumo" CHECK ("consumos"."tipo" in ('SOLICITUD', 'REINTEGRO'));--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "reintegro_con_origen" CHECK (("consumos"."tipo" = 'REINTEGRO') = ("consumos"."consumo_origen_id" is not null));--> statement-breakpoint
ALTER TABLE "movimientos_saldo" ADD CONSTRAINT "signo_segun_tipo" CHECK ("movimientos_saldo"."tipo"::text = 'AJUSTE' or ("movimientos_saldo"."tipo"::text in ('CARGA', 'REINTEGRO')) = ("movimientos_saldo"."creditos" > 0));