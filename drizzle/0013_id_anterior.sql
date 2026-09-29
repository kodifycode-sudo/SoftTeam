ALTER TABLE "aseguradoras" ADD COLUMN "id_anterior" varchar(20);--> statement-breakpoint
ALTER TABLE "productores" ADD COLUMN "id_anterior" varchar(20);--> statement-breakpoint
CREATE UNIQUE INDEX "aseguradoras_pais_id_id_anterior_index" ON "aseguradoras" USING btree ("pais_id","id_anterior");--> statement-breakpoint
CREATE UNIQUE INDEX "productores_empresa_id_id_anterior_index" ON "productores" USING btree ("empresa_id","id_anterior");