-- Schattenflächenberechnung
CREATE OR REPLACE FUNCTION get_shadow_areas(elevation FLOAT, azimuth FLOAT, table_name TEXT)
RETURNS VOID AS $$
BEGIN

	-- Gebäudeschatten berechnen
	-- ST_Extrude ist die perfekte Funktion zur Erzeugung von Gebäudeschatten (benötigt EXTENSION postgis_sfcgal)
	-- ST_Extrude erzeugt Objekte vom Typ 'PolyhedralSurface', die mit Dump wieder in herkömmliche Geometrien umgewandelt werden
	CREATE TABLE building_shadow AS
		-- WITH extent AS (
		-- 	SELECT ST_Transform(ST_MakeEnvelope(13.40850, 52.46563, 13.43226, 52.48768, 4326), 3857) AS extent_geom
		-- )
		SELECT
			ST_Force2D((ST_Dump(ST_Extrude(geom, h * (-tan(radians(90 - elevation)) * sin(radians(azimuth))), h * (-tan(radians(90 - elevation)) * cos(radians(azimuth))), 0))).geom) AS geom
		FROM building_components;--, extent
		-- optional: nur Features innerhalb des übergebenen extents berücksichtigen
		-- WHERE
		-- 	ST_Intersects (
		-- 		building_components.geom, 
		-- 		extent.extent_geom
		-- 	);

	-- (Einzel-)Baumschatten berechnen
	CREATE TABLE tree_shadow AS
		-- WITH extent AS (
		-- 	SELECT ST_Transform(ST_MakeEnvelope(13.40850, 52.46563, 13.43226, 52.48768, 4326), 3857) AS extent_geom
		-- )
		SELECT
			-- Baumkronen als Kreis verstehen und verschieben
			ST_Translate (
				-- Kreisdurchmesser entspricht dem Baumkronendurchmesser ('diameter_crown'), oder default 8 Meter
				ST_Buffer (
					geom,
					-- Kronendurchmesser in numerischen Wert umwandeln, wenn möglich, oder Default "8" annehmen
					COALESCE(
						NULLIF(
							CASE 
								WHEN diameter_crown ~ '^[0-9]+(\.[0-9]+)?$' THEN diameter_crown 
								ELSE NULL 
							END, 
							NULL
						)::NUMERIC, 
						8
					)
				),
				-- pragmatisch Baum als Kreis in 4 Metern höhe versehen und entsprechend des Sonnenstands verschieben
				-- TODO: In der Datenaufbereitung fehlende Höhen- und Durchmesserangaben schätzen aus jeweils vorhandenen Daten oder nach Default
				4 * (-tan(radians(90 - elevation)) * sin(radians(azimuth))),
				4 * (-tan(radians(90 - elevation)) * cos(radians(azimuth)))
				-- -- Verschieben entsprechend der Höhe (height, default 8 Meter), abzüglich eines halben Kronendurchmessers
				-- -- TODO: In der Datenaufbereitung fehlende Höhen- und Durchmesserangaben schätzen aus jeweils vorhandenen Daten oder nach Default
				-- -- TODO: Fälle abfangen, in denen dieser Wert negativ wird
				-- (COALESCE(NULLIF(CASE WHEN height ~ '^[0-9]+(\.[0-9]+)?$' THEN height ELSE NULL END, NULL)::NUMERIC, 8)
				-- 	- COALESCE(NULLIF(CASE WHEN diameter_crown ~ '^[0-9]+(\.[0-9]+)?$' THEN diameter_crown ELSE NULL END, NULL)::NUMERIC / 2, 4))
				-- 	* (-tan(radians(90 - elevation)) * sin(radians(azimuth))
				-- ),
				-- (COALESCE(NULLIF(CASE WHEN height ~ '^[0-9]+(\.[0-9]+)?$' THEN height ELSE NULL END, NULL)::NUMERIC, 8)
				-- 	- COALESCE(NULLIF(CASE WHEN diameter_crown ~ '^[0-9]+(\.[0-9]+)?$' THEN diameter_crown ELSE NULL END, NULL)::NUMERIC / 2, 4))
				-- 	* (-tan(radians(90 - elevation)) * cos(radians(azimuth))
				-- )
			) AS geom
		FROM
			trees;--, extent
		-- WHERE
		-- 	-- nur Features innerhalb der übergebenen BBOX berücksichtigen
		-- 	ST_Intersects (
		-- 		trees.geom, 
		-- 		extent.extent_geom
		-- 	);

	-- Waldschatten berechnen
	CREATE TABLE forest_shadow AS
		-- WITH extent AS (
		-- 	SELECT ST_Transform(ST_MakeEnvelope(13.40850, 52.46563, 13.43226, 52.48768, 4326), 3857) AS extent_geom
		-- )
		SELECT
			-- vereinfachte Annahme: Waldbäume sind 18 Meter hoch
			ST_Force2D((ST_Dump(ST_Extrude(geom, 18 * (-tan(radians(90 - elevation)) * sin(radians(azimuth))), 18 * (-tan(radians(90 - elevation)) * cos(radians(azimuth))), 0))).geom) AS geom
		FROM forests;--, extent
		-- WHERE
		-- 	ST_Intersects (
		-- 		forests.geom,
		-- 		extent.extent_geom
		-- 	);

	-- Alles in einer Tabelle zusammenführen
	-- Tabelle dynamisch entsprechend des Funktionsparameters benennen
	EXECUTE format('
		DROP TABLE IF EXISTS %I;
	', table_name);
	EXECUTE format('
		CREATE TABLE %I (
			id SERIAL PRIMARY KEY,
			geom geometry
		);
	', table_name);

	EXECUTE format('
		INSERT INTO %I (geom)
		SELECT geom FROM building_shadow
		UNION
        SELECT geom FROM tree_shadow
		UNION
        SELECT geom FROM forest_shadow;
	', table_name);

-------------------------------------------------

	-- optional: mit dissolve, dauert aber sehr viel länger
	-- EXECUTE format('
	-- 	WITH shadow_union AS (
	-- 		SELECT geom FROM building_shadow
	-- 		UNION ALL
	-- 		SELECT geom FROM tree_shadow
	-- 		UNION ALL
	-- 		SELECT geom FROM forest_shadow
	-- 	),
	-- 	shadow_dissolved AS (
	-- 		SELECT ST_Union(geom) AS geom
	-- 		FROM shadow_union
	-- 	)
	-- 	INSERT INTO %I (geom)
	-- 	SELECT (ST_Dump(geom)).geom
	-- 	FROM shadow_dissolved;
	-- ', table_name);

-------------------------------------------------

	-- Einzeltabellen löschen
	DROP TABLE IF EXISTS building_shadow;
	DROP TABLE IF EXISTS tree_shadow;
	DROP TABLE IF EXISTS forest_shadow;

END;
$$ LANGUAGE plpgsql;

--     | 21.01.  | 21.02.  | 21.03.  | 21.04.  | 21.05.  | 21.06.  || 21.07.  | 21.09.  | 21.12.  | < Ab Juli können vereinfacht die Daten der ersten Jahreshälfte wiederverwendet werden
-------+---------+---------+---------+---------+---------+---------++---------+---------+---------+ < Im Dezember kann - wie im November - der Januar-Wert angenommen werden
-- 09h | ------- | 13, 129 | 23, 125 | 35, 120 | 42, 115 | 44, 111 || 41, 112 | 26, 128 | ------- |
-- 11h | 15, 161 | 24, 158 | 35, 157 | 47, 156 | 55, 153 | 58, 149 || 55, 149 | 36, 161 | 13, 165 |
-- 13h | 17, 190 | 26, 191 | 36, 194 | 48, 200 | 56, 204 | 59, 204 || 57, 200 | 36, 199 | 13, 193 |
-- 15h | 9, 218  | 18, 221 | 27, 228 | 36, 237 | 43, 244 | 46, 245 || 45, 241 | 26, 232 | ------- |
-- 17h | ------- | ------- | 11, 255 | 19, 264 | 25, 270 | 29, 272 || 27, 269 | 9, 258  | ------- |
-- 19h | ------- | ------- | ------- | ------- | 8, 293  | 11, 294 || 9, 292  | ------- | ------- |

-- SELECT get_shadow_areas(0, 0, 'shadow_01_09');
SELECT get_shadow_areas(15, 161, 'shadow_01_11');
SELECT get_shadow_areas(17, 190, 'shadow_01_13');
SELECT get_shadow_areas(9, 218, 'shadow_01_15');
-- SELECT get_shadow_areas(0, 0, 'shadow_01_17');
-- SELECT get_shadow_areas(0, 0, 'shadow_01_19');

SELECT get_shadow_areas(13, 129, 'shadow_02_09');
SELECT get_shadow_areas(24, 158, 'shadow_02_11');
SELECT get_shadow_areas(26, 191, 'shadow_02_13');
SELECT get_shadow_areas(18, 221, 'shadow_02_15');
-- SELECT get_shadow_areas(0, 0, 'shadow_02_17');
-- SELECT get_shadow_areas(0, 0, 'shadow_02_19');

SELECT get_shadow_areas(23, 125, 'shadow_03_09');
SELECT get_shadow_areas(35, 157, 'shadow_03_11');
SELECT get_shadow_areas(36, 194, 'shadow_03_13');
SELECT get_shadow_areas(27, 228, 'shadow_03_15');
SELECT get_shadow_areas(11, 255, 'shadow_03_17');
-- SELECT get_shadow_areas(0, 0, 'shadow_03_19');

SELECT get_shadow_areas(35, 120, 'shadow_04_09');
SELECT get_shadow_areas(47, 156, 'shadow_04_11');
SELECT get_shadow_areas(48, 200, 'shadow_04_13');
SELECT get_shadow_areas(36, 237, 'shadow_04_15');
SELECT get_shadow_areas(19, 264, 'shadow_04_17');
-- SELECT get_shadow_areas(0, 0, 'shadow_04_19');

SELECT get_shadow_areas(42, 115, 'shadow_05_09');
SELECT get_shadow_areas(55, 153, 'shadow_05_11');
SELECT get_shadow_areas(56, 204, 'shadow_05_13');
SELECT get_shadow_areas(43, 244, 'shadow_05_15');
SELECT get_shadow_areas(25, 270, 'shadow_05_17');
SELECT get_shadow_areas(8, 293, 'shadow_05_19');

SELECT get_shadow_areas(44, 111, 'shadow_06_09');
SELECT get_shadow_areas(58, 149, 'shadow_06_11');
SELECT get_shadow_areas(59, 204, 'shadow_06_13');
SELECT get_shadow_areas(46, 245, 'shadow_06_15');
SELECT get_shadow_areas(29, 272, 'shadow_06_17');
SELECT get_shadow_areas(11, 294, 'shadow_06_19');

-- Mittlere Schattigkeit an Spielplatzflächen ermitteln
CREATE OR REPLACE FUNCTION calculate_shadow_share(table_name TEXT)
RETURNS VOID AS $$
BEGIN

	EXECUTE format('
		ALTER TABLE playgrounds
		ADD COLUMN IF NOT EXISTS %I NUMERIC(5,1);
	', table_name);

	EXECUTE format('
		WITH shaded_areas_single AS (
			SELECT
				p.id AS playground_id,
				ST_Intersection(p.geom, s.geom) AS intersection_geom
			FROM
				playgrounds p
			JOIN
				%I s
			ON
				ST_Intersects(p.geom, s.geom)
		),
		shaded_areas AS (
			SELECT
				playground_id,
				ST_Union(intersection_geom) AS shaded_geom
			FROM
				shaded_areas_single
			GROUP BY
				playground_id
		),
		shadow_summary AS (
			SELECT
				playground_id,
				ST_Area(shaded_geom) AS total_shadow_area
			FROM
				shaded_areas
		)
		UPDATE playgrounds p
		SET %I = COALESCE(o.total_shadow_area / ST_Area(p.geom) * 100, 0)
		FROM shadow_summary o
		WHERE p.id = o.playground_id;
	', table_name, table_name);

	EXECUTE format('
		UPDATE playgrounds
		SET %I = 0
		WHERE %I IS NULL;
	', table_name, table_name);

END;
$$ LANGUAGE plpgsql;

-- SELECT calculate_shadow_share('shadow_01_09');
SELECT calculate_shadow_share('shadow_01_11');
SELECT calculate_shadow_share('shadow_01_13');
SELECT calculate_shadow_share('shadow_01_15');
-- SELECT calculate_shadow_share('shadow_01_17');
-- SELECT calculate_shadow_share('shadow_01_19');

SELECT calculate_shadow_share('shadow_02_09');
SELECT calculate_shadow_share('shadow_02_11');
SELECT calculate_shadow_share('shadow_02_13');
SELECT calculate_shadow_share('shadow_02_15');
-- SELECT calculate_shadow_share('shadow_02_17');
-- SELECT calculate_shadow_share('shadow_02_19');

SELECT calculate_shadow_share('shadow_03_09');
SELECT calculate_shadow_share('shadow_03_11');
SELECT calculate_shadow_share('shadow_03_13');
SELECT calculate_shadow_share('shadow_03_15');
SELECT calculate_shadow_share('shadow_03_17');
-- SELECT calculate_shadow_share('shadow_03_19');

SELECT calculate_shadow_share('shadow_04_09');
SELECT calculate_shadow_share('shadow_04_11');
SELECT calculate_shadow_share('shadow_04_13');
SELECT calculate_shadow_share('shadow_04_15');
SELECT calculate_shadow_share('shadow_04_17');
-- SELECT calculate_shadow_share('shadow_04_19');

SELECT calculate_shadow_share('shadow_05_09');
SELECT calculate_shadow_share('shadow_05_11');
SELECT calculate_shadow_share('shadow_05_13');
SELECT calculate_shadow_share('shadow_05_15');
SELECT calculate_shadow_share('shadow_05_17');
SELECT calculate_shadow_share('shadow_05_19');

SELECT calculate_shadow_share('shadow_06_09');
SELECT calculate_shadow_share('shadow_06_11');
SELECT calculate_shadow_share('shadow_06_13');
SELECT calculate_shadow_share('shadow_06_15');
SELECT calculate_shadow_share('shadow_06_17');
SELECT calculate_shadow_share('shadow_06_19');