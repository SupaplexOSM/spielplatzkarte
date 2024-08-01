-----------------------------
-- Datenprobleme aufbereiten
-----------------------------

-- Ausstattungsmerkmale aus der Tabelle löschen, die weiter als 20 Meter von Spielplätzen entfernt sind
DELETE FROM completeness
WHERE 
  "feature_class" = 'feature'
  AND NOT EXISTS (
    SELECT 1
    FROM playgrounds
    WHERE ST_DWithin(completeness.geom, playgrounds.geom, 20)
  );

-- Bäume und Gebäude löschen die weiter als 50 bzw. 100 Meter von Spielplätzen entfernt sind
DELETE FROM completeness
WHERE 
  "feature_class" = 'tree'
  AND NOT EXISTS (
    SELECT 1
    FROM playgrounds
    WHERE ST_DWithin(completeness.geom, playgrounds.geom, 50)
  );

DELETE FROM completeness
WHERE 
  "feature_class" = 'building'
  AND NOT EXISTS (
    SELECT 1
    FROM playgrounds
    WHERE ST_DWithin(completeness.geom, playgrounds.geom, 100)
  );



------------------------------------------
-- Datenvollständigkeits- und Fehlerlayer
------------------------------------------

-- Überschneidende Spielplätze

-- Spielplätze ohne Spielgeräte

-- Spielplätze mit wenigen Spielgeräten

-- Spielgerät mit unspezifischem oder veraltetem Namen (water/rotator/sand, "slide" + "material=tyre")

-- Spielgeräte mit veraltetem Prüfdatum, Spielplatzpumpen auch mit fehlendem Prüfdatum

-- Spielgeräte mit ungünstiger Geometrie
    -- Linie erwünscht: slide, balancebeam, zipwire, track, monkey_bars
    -- Fläche erwünscht: structure, sandpit

-- structure ohne Einzelteile

-- Bäume mit fehlendem Kronendurchmesser und Gebäude ohne Höhen- oder Stockwerksangabe