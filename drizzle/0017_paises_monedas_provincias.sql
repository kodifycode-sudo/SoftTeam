CREATE TABLE "monedas" (
	"codigo" char(3) PRIMARY KEY NOT NULL,
	"nombre" varchar(40) NOT NULL,
	"simbolo" varchar(5) NOT NULL,
	"cotizacion" numeric(18, 6),
	"cotizacion_en" timestamp with time zone,
	"activa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cotizacion_positiva" CHECK ("monedas"."cotizacion" is null or "monedas"."cotizacion" > 0)
);
--> statement-breakpoint
CREATE TABLE "provincias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pais_id" char(2) NOT NULL,
	"codigo" varchar(5) NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paises" ADD COLUMN "nombre_corto" varchar(20);--> statement-breakpoint
ALTER TABLE "provincias" ADD CONSTRAINT "provincias_pais_id_paises_id_fk" FOREIGN KEY ("pais_id") REFERENCES "public"."paises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provincias_pais_id_codigo_index" ON "provincias" USING btree ("pais_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "provincias_pais_id_nombre_index" ON "provincias" USING btree ("pais_id","nombre");--> statement-breakpoint
INSERT INTO "monedas" ("codigo", "nombre", "simbolo", "cotizacion") VALUES ('ARS', 'Peso argentino', '$', 1), ('USD', 'Dólar estadounidense', 'US$', NULL) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "monedas" ("codigo", "nombre", "simbolo") SELECT DISTINCT "moneda", "moneda", "moneda" FROM "paises" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "provincias" ("pais_id", "codigo", "nombre") SELECT 'AR', v.codigo, v.nombre FROM (VALUES ('B', 'Buenos Aires'), ('C', 'Ciudad Autónoma de Buenos Aires'), ('K', 'Catamarca'), ('H', 'Chaco'), ('U', 'Chubut'), ('X', 'Córdoba'), ('W', 'Corrientes'), ('E', 'Entre Ríos'), ('P', 'Formosa'), ('Y', 'Jujuy'), ('L', 'La Pampa'), ('F', 'La Rioja'), ('M', 'Mendoza'), ('N', 'Misiones'), ('Q', 'Neuquén'), ('R', 'Río Negro'), ('A', 'Salta'), ('J', 'San Juan'), ('D', 'San Luis'), ('Z', 'Santa Cruz'), ('S', 'Santa Fe'), ('G', 'Santiago del Estero'), ('V', 'Tierra del Fuego'), ('T', 'Tucumán')) AS v(codigo, nombre) WHERE EXISTS (SELECT 1 FROM "paises" WHERE "id" = 'AR') ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "paises" ADD CONSTRAINT "paises_moneda_monedas_codigo_fk" FOREIGN KEY ("moneda") REFERENCES "public"."monedas"("codigo") ON DELETE no action ON UPDATE no action;