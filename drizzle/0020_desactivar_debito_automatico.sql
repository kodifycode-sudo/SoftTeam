-- El débito automático de Mercado Pago queda para más adelante (decisión del 29/09/2026):
-- el medio no se ofrece hasta definir cómo encaja con las renovaciones quincenales.
UPDATE "medios_pago" SET "activo" = false WHERE "codigo" = 'SUSC_MP';
