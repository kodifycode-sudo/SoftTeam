-- Saldo prepago acumulado: cada consumo leía el saldo sumando todos los
-- movimientos del contrato, que crecen sin límite. Ahora el saldo vive en
-- contrato_recursos.saldo y lo mantiene un trigger en la misma transacción
-- que el movimiento: no hay forma de que se desincronice (código, scripts o
-- SQL manual pasan todos por acá).
ALTER TABLE "contrato_recursos" ADD COLUMN "saldo" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "contrato_recursos" AS cr
SET "saldo" = m.total
FROM (
  SELECT "contrato_id", "recurso_id", sum("creditos")::int AS total
  FROM "movimientos_saldo"
  WHERE "clase" = 'SALDO'
  GROUP BY "contrato_id", "recurso_id"
) AS m
WHERE cr."contrato_id" = m."contrato_id" AND cr."recurso_id" = m."recurso_id";--> statement-breakpoint
CREATE FUNCTION "actualizar_saldo_contrato"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."clase" = 'SALDO' THEN
    UPDATE "contrato_recursos" SET "saldo" = "saldo" - OLD."creditos"
    WHERE "contrato_id" = OLD."contrato_id" AND "recurso_id" = OLD."recurso_id";
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW."clase" = 'SALDO' THEN
    UPDATE "contrato_recursos" SET "saldo" = "saldo" + NEW."creditos"
    WHERE "contrato_id" = NEW."contrato_id" AND "recurso_id" = NEW."recurso_id";
    -- Un movimiento de saldo sin su recurso en el contrato no se contaría: es un error.
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El contrato % no tiene el recurso %', NEW."contrato_id", NEW."recurso_id";
    END IF;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "movimientos_saldo_actualizan_saldo"
AFTER INSERT OR UPDATE OR DELETE ON "movimientos_saldo"
FOR EACH ROW EXECUTE FUNCTION "actualizar_saldo_contrato"();
