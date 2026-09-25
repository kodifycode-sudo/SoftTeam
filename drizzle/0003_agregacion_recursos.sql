CREATE TYPE "public"."agregacion_recurso" AS ENUM('SUMA', 'MAXIMO');--> statement-breakpoint
ALTER TABLE "recursos" ADD COLUMN "agregacion" "agregacion_recurso" DEFAULT 'SUMA' NOT NULL;--> statement-breakpoint
UPDATE "recursos" SET "agregacion" = 'MAXIMO' WHERE "id" = 'prodigal.retencion';
