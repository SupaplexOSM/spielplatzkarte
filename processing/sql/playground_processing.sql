------------------------------------------
-- Allgemeine Spielplatzdaten aufbereiten
------------------------------------------

-- Punktdaten gepuffert mit Flächendaten zusammenführen
-- dafür Punkte um 10 Meter puffern und in Folge nur noch als kleine runde Flächen betrachten
ALTER TABLE playground_nodes
ADD COLUMN IF NOT EXISTS geom_area geometry(POLYGON, 3857);

-- 10-Meter-Pufferfläche um alle Punkte erzeugen
UPDATE playground_nodes
SET geom_area = ST_Transform(ST_Buffer(ST_Transform(geom, 4326)::geography, 5)::geometry, 3857)::geometry;

-- geom-Spalte ersetzen
ALTER TABLE playground_nodes
DROP COLUMN geom;
ALTER TABLE playground_nodes
RENAME COLUMN geom_area TO geom;

-- (ehemalige) Punkt-Daten in die Flächendaten-Tabelle überführen
INSERT INTO playgrounds
SELECT * FROM playground_nodes;

-- Punktdaten werden nicht weiter benötigt
DROP TABLE IF EXISTS playground_nodes;

-- eindeutige id-Spalte ergänzen (nodes und ways können theoretisch die gleiche numerische OSM-ID haben)
ALTER TABLE playgrounds
ADD COLUMN id SERIAL PRIMARY KEY;

-- frischen räumlichen Index erzeugen
CREATE INDEX idx_playgrounds ON playgrounds USING GIST (geom);

-- Spielplatzfläche ermitteln
ALTER TABLE playgrounds
ADD COLUMN area DOUBLE PRECISION;

UPDATE playgrounds
SET area = ST_Area(ST_Transform(geom, 4326)::geography)
WHERE osm_type <> 'N';

-- Vier Größenklassen von Spielplätzen unterscheiden
ALTER TABLE playgrounds
ADD COLUMN area_class INTEGER;

UPDATE playgrounds
SET area_class =
    CASE
        WHEN area >= 5000 THEN 3
        WHEN area >= 2500 THEN 2
        WHEN area >= 750 THEN 1
        ELSE 0
    END;

-- Bereiche identifizieren, innerhalb derer sich der Spielplatz befindet (Parks, Schulen...)
ALTER TABLE playgrounds
ADD COLUMN in_site TEXT;

UPDATE playgrounds
SET in_site = (
    SELECT name
    FROM sites
    WHERE ST_Contains(sites.geom, playgrounds.geom)
    LIMIT 1
);

-- Nächstgelegene Straße identifizieren
ALTER TABLE playgrounds
ADD COLUMN nearest_highway TEXT;

UPDATE playgrounds
SET nearest_highway = (
    SELECT name
    FROM highways
    ORDER BY playgrounds.geom <-> highways.geom
    LIMIT 1
);

-------------------------------------------
-- Spielplatzausstattungsdaten aufbereiten
-------------------------------------------

-- (geometrische) Länge von einzelnen Spielgeräten ermitteln
-- TODO Rutschen-Linien vereinigen, wenn sie aneinander angrenzen, in die gleiche Richtung zeigen und die gleichen Attribute haben (um selbstüberschneidende/gewendelte Rutschen zusammenzufügen, die in OSM als mehrere Linien vorliegen)
ALTER TABLE playground_equipment_way
ADD COLUMN length DOUBLE PRECISION;

UPDATE playground_equipment_way
SET length = ROUND(ST_Length(geom)::numeric, 1)
-- Liste der Spielgeräte, für die eine Längenangabe sinnvoll ist
WHERE playground IN (
    'slide',
    'bridge',
    'wobble_bridge',
    'balancebeam',
    'rope_traverse',
    'monkey_bars',
    'water_channel',
    'water_stream',
    'zipwire',
    'belt_bridge',
    'tunnel_tube',
    'track',
    'marble_run'
);

-- Alle Ausstattungsmerkmale (wie Sitzbänke etc.) entfernen, die weiter als 20 Meter vom Spielplatz entfernt sind
DELETE FROM playground_equipment_node
WHERE 
  "playground" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM playgrounds
    WHERE ST_DWithin(playground_equipment_node.geom, playgrounds.geom, 20)
  );
DELETE FROM playground_equipment_way
WHERE 
  "playground" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM playgrounds
    WHERE ST_DWithin(playground_equipment_way.geom, playgrounds.geom, 20)
  );
DELETE FROM playground_equipment_polygon
WHERE 
  "playground" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM playgrounds
    WHERE ST_DWithin(playground_equipment_polygon.geom, playgrounds.geom, 20)
  );

-- Vereinfachte Tabelle aller Spielgeräte und Ausstattungsmerkmale in Punktform generieren (für Spielgerätefinder und Analyse von Ausstattungsmerkmalen)
DROP TABLE IF EXISTS playground_equipment;
CREATE TABLE playground_equipment (
    id SERIAL PRIMARY KEY, -- laufende ID-Spalte ergänzen, da OSM-ways und nodes theoretisch die gleiche "osm_id" haben könnten (entweder mit type "W" oder "N")
    osm_type TEXT,
    osm_id BIGINT,
    playground TEXT,
    amenity TEXT,
    leisure TEXT,
    height NUMERIC(5,1),
    length NUMERIC(5,1),
    baby TEXT,
    "provided_for:toddler" TEXT,
    wheelchair TEXT,
    covered TEXT, -- zum filtern nach überdachten Picknicktischen
    sport TEXT, -- zum filtern nach Tischtennisplatten, Bolzplätzen und Basketballfeldern
    geom GEOMETRY(Point, 3857)
);

INSERT INTO playground_equipment (osm_type, osm_id, playground, amenity, leisure, height, baby, "provided_for:toddler", wheelchair, covered, sport, geom)
SELECT osm_type, osm_id, playground, amenity, leisure,
    -- Höhenangaben ("height") direkt in numerischen Wert umwandeln, wenn möglich; Kommas und Meter-Einheiten dabei ersetzen/entfernen
    CASE
        WHEN regexp_replace(replace(trim(height), 'm', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN CAST(regexp_replace(replace(trim(height), 'm', ''), ',', '.') AS NUMERIC(5,1))
        ELSE NULL
    END AS height, baby, "provided_for:toddler", wheelchair, covered, sport, geom
FROM playground_equipment_node;

INSERT INTO playground_equipment (osm_type, osm_id, playground, amenity, leisure, height, length, baby, "provided_for:toddler", wheelchair, covered, sport, geom)
SELECT osm_type, osm_id, playground, amenity, leisure,
    CASE
        WHEN regexp_replace(replace(trim(height), 'm', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN CAST(regexp_replace(replace(trim(height), 'm', ''), ',', '.') AS NUMERIC(5,1))
        ELSE NULL
    END AS height, CAST(length AS NUMERIC(5,1)), baby, "provided_for:toddler", wheelchair, covered, sport, ST_Centroid(geom)
FROM playground_equipment_way;

INSERT INTO playground_equipment (osm_type, osm_id, playground, amenity, leisure, height, baby, "provided_for:toddler", wheelchair, covered, sport, geom)
SELECT osm_type, osm_id, playground, amenity, leisure,
    CASE
        WHEN regexp_replace(replace(trim(height), 'm', ''), ',', '.') ~ '^[0-9]+(\.[0-9]+)?$'
        THEN CAST(regexp_replace(replace(trim(height), 'm', ''), ',', '.') AS NUMERIC(5,1))
        ELSE NULL
    END AS height, baby, "provided_for:toddler", wheelchair, covered, sport, ST_PointOnSurface(geom)
FROM playground_equipment_polygon;

-- räumlichen Index erzeugen
CREATE INDEX idx_playground_equipment ON playground_equipment USING GIST (geom);

----------------------------------
-- Spielplatzmerkmale analysieren
----------------------------------

-- Spielgeräte zählen
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS device_count INTEGER DEFAULT 0;

WITH device_count_query AS (
    SELECT
        playgrounds.id AS playgrounds_id, 
        COUNT(playground_equipment.id) AS device_count
    FROM playgrounds
    LEFT JOIN playground_equipment
    ON ST_Contains(playgrounds.geom, playground_equipment.geom) AND playground_equipment.playground IS NOT NULL
    GROUP BY playgrounds.id
)
UPDATE playgrounds
SET device_count = device_count_query.device_count
FROM device_count_query
WHERE playgrounds.id = device_count_query.playgrounds_id;

-- Sitzbänke zählen
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS bench_count INTEGER DEFAULT 0;

WITH bench_count_query AS (
    SELECT
        playgrounds.id AS playgrounds_id, 
        COUNT(playground_equipment.id) AS bench_count
    FROM playgrounds
    LEFT JOIN playground_equipment
    ON ST_Contains(playgrounds.geom, playground_equipment.geom) AND playground_equipment.amenity = 'bench'
    GROUP BY playgrounds.id
)
UPDATE playgrounds
SET bench_count = bench_count_query.bench_count
FROM bench_count_query
WHERE playgrounds.id = bench_count_query.playgrounds_id;

-- Unterstände zählen
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS shelter_count INTEGER DEFAULT 0;

WITH shelter_count_query AS (
    SELECT
        playgrounds.id AS playgrounds_id, 
        COUNT(playground_equipment.id) AS shelter_count
    FROM playgrounds
    LEFT JOIN playground_equipment
    ON ST_Contains(playgrounds.geom, playground_equipment.geom) AND playground_equipment.amenity = 'shelter'
    GROUP BY playgrounds.id
)
UPDATE playgrounds
SET shelter_count = shelter_count_query.shelter_count
FROM shelter_count_query
WHERE playgrounds.id = shelter_count_query.playgrounds_id;

-- Picknicktische zählen
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS picnic_count INTEGER DEFAULT 0;

WITH picnic_count_query AS (
    SELECT
        playgrounds.id AS playgrounds_id, 
        COUNT(playground_equipment.id) AS picnic_count
    FROM playgrounds
    LEFT JOIN playground_equipment
    ON ST_Contains(playgrounds.geom, playground_equipment.geom) AND playground_equipment.leisure = 'picnic_table'
    GROUP BY playgrounds.id
)
UPDATE playgrounds
SET picnic_count = picnic_count_query.picnic_count
FROM picnic_count_query
WHERE playgrounds.id = picnic_count_query.playgrounds_id;

-- Tischtennisplatten zählen
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS table_tennis_count INTEGER DEFAULT 0;

WITH table_tennis_count_query AS (
    SELECT
        playgrounds.id AS playgrounds_id, 
        COUNT(playground_equipment.id) AS table_tennis_count
    FROM playgrounds
    LEFT JOIN playground_equipment
    ON ST_Contains(playgrounds.geom, playground_equipment.geom) AND playground_equipment.leisure = 'pitch' AND playground_equipment.sport = 'table_tennis'
    GROUP BY playgrounds.id
)
UPDATE playgrounds
SET table_tennis_count = table_tennis_count_query.table_tennis_count
FROM table_tennis_count_query
WHERE playgrounds.id = table_tennis_count_query.playgrounds_id;

-- mit Bolzplatz
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS has_soccer BOOLEAN;

UPDATE playgrounds
SET has_soccer =
    EXISTS (
        SELECT 1
        FROM playground_equipment
        WHERE playground_equipment.leisure = 'pitch' AND playground_equipment.sport = 'soccer' AND ST_Intersects(playgrounds.geom, playground_equipment.geom)
    );

-- mit Basketballplatz
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS has_basketball BOOLEAN;

UPDATE playgrounds
SET has_basketball =
    EXISTS (
        SELECT 1
        FROM playground_equipment
        WHERE playground_equipment.leisure = 'pitch' AND (playground_equipment.sport = 'basketball' OR playground_equipment.sport = 'streetball') AND ST_Intersects(playgrounds.geom, playground_equipment.geom)
    );

-- Spielgeräte auflisten
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS playground_devices TEXT;

UPDATE playgrounds
SET playground_devices = subquery.playground
FROM (
    -- CONCAT: ein anführendes und abschließendes Semikolon vereinfacht die exakte Suche nach Geräte-Strings, da stehts das ";" mitgesucht werden kann und dadurch keine Teilstrings anderer Geräte gefunden werden können
    SELECT osm_id, CONCAT(';', STRING_AGG(playground, ';'), ';') AS playground
    FROM (
        SELECT playgrounds.osm_id, playground_equipment.playground
        FROM playgrounds
        JOIN playground_equipment ON ST_Contains(playgrounds.geom, playground_equipment.geom)
    ) AS playground_equipment_join
    GROUP BY osm_id
) AS subquery
WHERE playgrounds.osm_id = subquery.osm_id;

-- Spalten für generische Ausstattungsmerkmale ergänzen:
-- Wasserspielplätze identifizieren
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS is_water BOOLEAN;

UPDATE playgrounds
SET is_water = 
    playground_devices ILIKE '%water%' OR
    playground_devices LIKE ';splash_pad;' OR
    playground_devices LIKE ';pump;';

-- Baby-gerechte Spielgeräte
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS for_baby BOOLEAN;

UPDATE playgrounds
SET for_baby =
    -- wenn "baby=yes" am Spielplatz getaggt ist...
    baby LIKE 'yes' OR
    -- ...oder bestimmte Baby-gerechte Spielgeräte vorhanden sind...
    playground_devices LIKE ';baby_swing;' OR
    playground_devices LIKE ';basketswing;' OR
    -- ...oder es innerhalb der Spielplatzgeometrie Spielgeräte mit "baby=yes" gibt
    EXISTS (
        SELECT 1
        FROM playground_equipment
        WHERE playground_equipment.baby = 'yes' AND ST_Intersects(playgrounds.geom, playground_equipment.geom)
    );

-- Kleinkind-gerechte Spielgeräte
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS for_toddler BOOLEAN;

UPDATE playgrounds
SET for_toddler =
    "provided_for:toddler" LIKE 'yes' OR
    playground_devices LIKE ';basketswing;' OR
    EXISTS (
        SELECT 1
        FROM playground_equipment
        WHERE playground_equipment."provided_for:toddler" = 'yes' AND ST_Intersects(playgrounds.geom, playground_equipment.geom)
    );

-- Rollstuhlgerechte Spielgeräte
ALTER TABLE playgrounds
ADD COLUMN IF NOT EXISTS for_wheelchair BOOLEAN;

UPDATE playgrounds
SET for_wheelchair =
    -- wheelchair LIKE 'yes' OR
    EXISTS (
        SELECT 1
        FROM playground_equipment
        WHERE playground_equipment.wheelchair = 'yes' AND ST_Intersects(playgrounds.geom, playground_equipment.geom) AND playground_equipment.playground != 'sandpit'
    );