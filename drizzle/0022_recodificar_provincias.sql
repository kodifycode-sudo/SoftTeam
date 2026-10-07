-- Provincias argentinas: del código ISO 3166-2 de una letra al código legible
-- que genera el sistema a partir del nombre (src/domain/catalogo/provincias.ts).
-- Solo cambia las que conservan el código ISO original; el código se usa para
-- mostrar y exportar (los domicilios guardan el nombre). Ningún código nuevo
-- es de una letra, así que no choca con los viejos durante la actualización.
UPDATE "provincias" AS p
SET "codigo" = v.nuevo
FROM (VALUES
  ('B', 'BA'), ('K', 'CAT'), ('H', 'CHA'), ('U', 'CHU'), ('C', 'CABA'), ('W', 'COR'),
  ('X', 'CRD'), ('E', 'ER'), ('P', 'FOR'), ('Y', 'JUJ'), ('L', 'LP'), ('F', 'LR'),
  ('M', 'MEN'), ('N', 'MIS'), ('Q', 'NEU'), ('R', 'RN'), ('A', 'SAL'), ('J', 'SJ'),
  ('D', 'SL'), ('Z', 'SC'), ('S', 'SF'), ('G', 'SE'), ('V', 'TF'), ('T', 'TUC')
) AS v(viejo, nuevo)
WHERE p."pais_id" = 'AR' AND p."codigo" = v.viejo;
