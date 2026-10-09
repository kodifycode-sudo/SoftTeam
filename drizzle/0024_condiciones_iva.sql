-- Condiciones frente al IVA configurables (Mejora v2.1, 2.8 y 2.9): alícuota,
-- comprobante y código ARCA pasan de estar fijos en el código a una tabla que
-- edita Administración. Los códigos actuales se conservan, así que clientes,
-- productores y órdenes no cambian de valor. El exento paga IVA (v2.1 corrige
-- el criterio de la v2.0): la alícuota rige para las órdenes que se confirmen
-- desde ahora; las ya emitidas conservan la suya.
CREATE TABLE "condiciones_iva" (
	"codigo" varchar(30) PRIMARY KEY NOT NULL,
	"pais_id" char(2) NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"codigo_arca" smallint NOT NULL,
	"alicuota" numeric(7, 2) NOT NULL,
	"comprobante" char(1) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "comprobante_valido" CHECK ("condiciones_iva"."comprobante" in ('A', 'B', 'E')),
	CONSTRAINT "alicuota_rango" CHECK ("condiciones_iva"."alicuota" >= 0 and "condiciones_iva"."alicuota" <= 100)
);
--> statement-breakpoint
ALTER TABLE "condiciones_iva" ADD CONSTRAINT "condiciones_iva_pais_id_paises_id_fk" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "condiciones_iva_pais_id_nombre_index" ON "condiciones_iva" USING btree ("pais_id","nombre");--> statement-breakpoint
-- En una base nueva todavía no hay países: la carga la hace la semilla.
INSERT INTO "condiciones_iva" ("codigo", "pais_id", "nombre", "codigo_arca", "alicuota", "comprobante", "activa", "orden")
SELECT c.codigo, p.id, c.nombre, c.arca, CASE WHEN c.comprobante = 'E' THEN 0 ELSE p.alicuota_iva_general END, c.comprobante, c.activa, c.orden
FROM "paises" p
CROSS JOIN (VALUES
	('RESPONSABLE_INSCRIPTO', 'IVA Responsable Inscripto', 1, 'A', true, 1),
	('CONSUMIDOR_FINAL', 'Consumidor Final', 5, 'B', true, 2),
	('MONOTRIBUTO', 'Monotributo (Factura B)', 6, 'B', true, 3),
	('MONOTRIBUTO_A', 'Monotributo (Factura A)', 6, 'A', true, 4),
	('EXENTO', 'IVA Sujeto Exento', 4, 'B', true, 5),
	('GRAN_CONTRIBUYENTE', 'Gran Contribuyente', 1, 'A', true, 6),
	('EXTERIOR', 'Cliente del Exterior', 9, 'E', false, 7)
) AS c (codigo, nombre, arca, comprobante, activa, orden)
WHERE p.id = 'AR';--> statement-breakpoint
ALTER TABLE "productores" ALTER COLUMN "condicion_iva" SET DATA TYPE varchar(30) USING "condicion_iva"::text;--> statement-breakpoint
ALTER TABLE "clientes" ALTER COLUMN "condicion_iva" SET DATA TYPE varchar(30) USING "condicion_iva"::text;--> statement-breakpoint
ALTER TABLE "ordenes" ALTER COLUMN "condicion_iva" SET DATA TYPE varchar(30) USING "condicion_iva"::text;--> statement-breakpoint
ALTER TABLE "ordenes" ADD COLUMN "codigo_arca" smallint;--> statement-breakpoint
UPDATE "ordenes" o SET "codigo_arca" = c."codigo_arca" FROM "condiciones_iva" c WHERE c."codigo" = o."condicion_iva";--> statement-breakpoint
ALTER TABLE "ordenes" ALTER COLUMN "codigo_arca" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "productores" ADD CONSTRAINT "productores_condicion_iva_condiciones_iva_codigo_fk" FOREIGN KEY ("condicion_iva") REFERENCES "public"."condiciones_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_condicion_iva_condiciones_iva_codigo_fk" FOREIGN KEY ("condicion_iva") REFERENCES "public"."condiciones_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordenes" ADD CONSTRAINT "ordenes_condicion_iva_condiciones_iva_codigo_fk" FOREIGN KEY ("condicion_iva") REFERENCES "public"."condiciones_iva"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."condicion_iva";
