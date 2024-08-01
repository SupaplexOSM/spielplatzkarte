-----------------------
-- Gebäude vorbereiten
-----------------------

-- Gebäudebestandteile aus Gebäuden ("building"=*) extrahieren, die nicht bereits von Gebäudeteilen ("building:part"=*) abgedeckt werden
-- (auf Bereiche im Umkreis von Spielplätzen beschränken)
DROP TABLE IF EXISTS building_components;
CREATE TABLE building_components AS
SELECT
    buildings.osm_id,
    buildings."building:levels",
    buildings.height,
    buildings.est_height,
    ST_MakeValid(ST_Difference(buildings.geom, COALESCE(ST_Union(building_parts.geom), ST_GeomFromText('POLYGON EMPTY', 3857)))) AS geom
FROM buildings
JOIN playgrounds ON ST_DWithin(buildings.geom, playgrounds.geom, 100)
LEFT JOIN building_parts ON ST_Intersects(buildings.geom, building_parts.geom)
WHERE ST_DWithin(buildings.geom, playgrounds.geom, 100)
GROUP BY
    buildings.osm_id,
    buildings."building:levels",
    buildings.height,
    buildings.est_height,
    buildings.geom;

-- Andere Gebäudeteile zur neuen Tabelle hinzufügen (falls sich diese in Spielplatznähe befinden)
INSERT INTO building_components
SELECT
    building_parts.osm_id,
    building_parts."building:levels",
    building_parts.height,
    building_parts.est_height,
    building_parts.geom
FROM building_parts
JOIN playgrounds ON ST_DWithin(building_parts.geom, playgrounds.geom, 100);

-- Räumlichen Index für neue Tabelle erstellen
CREATE INDEX building_components_idx ON building_components USING GIST (geom);

-- Ausgangstabellen werden nun nicht mehr benötigt
DROP TABLE IF EXISTS buildings;
DROP TABLE IF EXISTS building_parts;

-- Höhenangaben vervollständigen
ALTER TABLE building_components
ADD COLUMN IF NOT EXISTS h_text TEXT;

UPDATE building_components
SET h_text = COALESCE(
        height,
        est_height,
		CASE
			WHEN trim(translate("building:levels", '0123456789.', '')) = ''
			THEN CAST(CAST("building:levels" AS DECIMAL) * 4 AS TEXT)
			ELSE '4'
		END
    );

ALTER TABLE building_components
ADD COLUMN IF NOT EXISTS h DECIMAL;

UPDATE building_components
SET h = CASE WHEN trim(translate(h_text, '0123456789.', '')) = '' 
             THEN CAST(h_text AS DECIMAL) 
        ELSE 4
        END;

-- Alle Attribute außer Geometrie, id und Höhe löschen
ALTER TABLE building_components
DROP COLUMN IF EXISTS "building:levels",
DROP COLUMN IF EXISTS height,
DROP COLUMN IF EXISTS est_height,
DROP COLUMN IF EXISTS h_text;

-- Geometrien korrigieren -- TODO: Unklar, ob das überhaupt zu Verbesserungen führt
UPDATE building_components
SET geom = ST_MakeValid(geom);

--------------------------------
-- Bäume und Wälder vorbereiten
--------------------------------

-- Alle Bäume löschen, die sich nicht im Umfeld von 50 Metern um Spielplätze befinden
DELETE FROM trees
WHERE 
    NOT EXISTS (
        SELECT 1
        FROM playgrounds
        WHERE ST_DWithin(trees.geom, playgrounds.geom, 50)
    );

-- Alle Wälder löschen, die sich nicht im Umfeld von 50 Metern um Spielplätze befinden
DELETE FROM forests
WHERE 
    NOT EXISTS (
        SELECT 1
        FROM playgrounds
        WHERE ST_DWithin(forests.geom, playgrounds.geom, 50)
    );