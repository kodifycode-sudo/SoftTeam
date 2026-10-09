-- Ciclo mensual alineado: día de vencimiento y tramo
-- prorrateado de cada contrato; la orden es opcional para las altas a grupo
-- que esperan la orden colectiva; corridas los días 2 y 11; alerta de
-- renovaciones a negociar; plan trimestral para el alta inicial.
ALTER TYPE "public"."tipo_alerta" ADD VALUE 'RENOVACION_A_NEGOCIAR';--> statement-breakpoint
ALTER TABLE "contratos" ALTER COLUMN "orden_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "dia_venc" smallint;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "prorrata_hasta" date;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "prorrata_dias" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "prorrata_importe" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Contratos existentes: 20 si ya vencen ese día; 10 en los demás (se alinean
-- con un tramo en la próxima renovación).
UPDATE "contratos" SET "dia_venc" = CASE WHEN extract(day from "hasta") = 20 THEN 20 ELSE 10 END
WHERE "tipo_paquete" = 'TEMPORAL';--> statement-breakpoint
UPDATE "parametros" SET "valor" = '[2, 11]'::jsonb WHERE "clave" = 'renovacion.dias_corte';--> statement-breakpoint
-- Plan trimestral para el alta inicial en los paquetes temporales con
-- plan mensual: tres meses al precio de compra mensual. Administración lo ajusta.
INSERT INTO "alternativas" ("paquete_id", "nombre", "meses", "precio_compra", "precio_renovacion", "orden")
SELECT DISTINCT ON (a."paquete_id") a."paquete_id", 'Trimestral inicial', 3, a."precio_compra" * 3, a."precio_compra" * 3, -1
FROM "alternativas" a
JOIN "paquetes" p ON p."id" = a."paquete_id"
WHERE p."tipo" = 'TEMPORAL' AND a."meses" = 1 AND a."activa"
  AND NOT EXISTS (SELECT 1 FROM "alternativas" x WHERE x."paquete_id" = a."paquete_id" AND x."meses" = 3)
ORDER BY a."paquete_id", a."orden";
