-- Modo de facturación del cliente en lugar del tipo de
-- cliente de la empresa. CORPORATIVO (el servicio nunca se corta) pasa al
-- modo 3; DIRECTO, al 0. Prórroga del contrato y medios de pago por modo
-- (6.5, valores iniciales editables por Administración).
ALTER TABLE "medios_pago" ADD COLUMN "modos_facturacion" smallint[] DEFAULT '{0,1,2,3}' NOT NULL;--> statement-breakpoint
UPDATE "medios_pago" SET "modos_facturacion" = CASE "tipo"
	WHEN 'LINK_MP' THEN '{0,2}'::smallint[]
	WHEN 'TRANSFERENCIA' THEN '{1}'::smallint[]
	WHEN 'SUSCRIPCION_MP' THEN '{2}'::smallint[]
	WHEN 'PLANILLA' THEN '{3}'::smallint[]
	ELSE "modos_facturacion" END;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "modo_facturacion" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "clientes" c SET "modo_facturacion" = 3
WHERE EXISTS (SELECT 1 FROM "empresas" e WHERE e."cliente_id" = c."id" AND e."tipo_cliente" = 'CORPORATIVO');--> statement-breakpoint
ALTER TABLE "contratos" ADD COLUMN "prorroga_hasta" date;--> statement-breakpoint
ALTER TABLE "ordenes" ADD COLUMN "modo_facturacion" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "ordenes" o SET "modo_facturacion" = c."modo_facturacion" FROM "clientes" c WHERE c."id" = o."cliente_facturacion_id";--> statement-breakpoint
ALTER TABLE "empresas" DROP COLUMN "tipo_cliente";--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "modo_facturacion_valido" CHECK ("clientes"."modo_facturacion" between 0 and 3);--> statement-breakpoint
DROP TYPE "public"."tipo_cliente";
