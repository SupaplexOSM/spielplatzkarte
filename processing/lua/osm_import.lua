-- lua-Konfigurationsscript zum Import der Daten für die Spielplatzkarte mit osm2pgsql
--------------------------------------------------------------------------------------
-- Importierte Daten und Tabellen:
-- > Spielplätze (Flächen- oder Punktgeometrien)
--   - playgrounds
--   - playground_nodes (werden später in SQL auf "playgrounds" zusammengeführt)
-- > Spielgeräte und Ausstattungsmerkmale (Flächen-, Linien- oder Punktgeometrien)
--   - playground_equipment_polygon
--   - playground_equipment_way
--   - playground_equipment_node
--> Gelände (Parks, Schulen...) und Straßen mit Namen (für ergänzende Lagebezeichnungen von Spielplätzen)
--   - sites
--   - highways
-- > Schattenrelevante Objekte (Bäume/Sträucher/Wälder und Gebäude/Gebäudeteile)
--   - buildings
--   - building_parts
--   - trees
--   - forests
-- > Datenprobleme (Spielplätze, Ausstattungsmerkmale, Bäume und Gebäude mit fehlenden Daten)
--   - completeness
--------------------------------------------------------------------------------------

-- Spalten für alle Attribute definieren, die aus den OSM-Daten übernommen werden sollen
-- 1) für Spielplätze
local attributes_playground = {
    { column = 'access' },
    { column = 'private' },

    { column = 'name' },
    { column = 'alt_name' },
    { column = 'loc_name' },
    { column = 'official_name' },
    { column = 'old_name' },
    { column = 'short_name' },

    { column = 'image' },
    { column = 'wikimedia_commons' },
    { column = 'wikipedia' },
    { column = 'wikidata' },

    { column = 'addr:street' },
    { column = 'addr:housenumber' },
    { column = 'addr:postcode' },
    { column = 'addr:city' },
    { column = 'addr:suburb' },

    { column = 'operator' },
    { column = 'operator:type' },

    { column = 'contact:website' },
    { column = 'contact:phone' },
    { column = 'contact:email' },

    { column = 'description' },
    { column = 'description:de' },
    { column = 'note' },
    { column = 'fixme' },

    { column = 'playground' },

    { column = 'min_age' },
    { column = 'max_age' },
    { column = 'baby' },
    { column = 'provided_for:toddler' },

    { column = 'wheelchair' },
    { column = 'wheelchair:description' },

    { column = 'toilets' },
    { column = 'toilets:wheelchair' },

    { column = 'protection_title' },
    { column = 'start_date' },
    { column = 'check_date' }
}

-- 2) für Spielgeräte und Ausstattungsmerkmale
local attributes_playground_equipment = {
    { column = 'playground' },
    { column = 'playground:theme' },

    { column = 'name' },
    { column = 'image' },
    { column = 'description' },
    { column = 'description:de' },
    { column = 'note' },
    { column = 'fixme' },

    { column = 'baby' },
    { column = 'provided_for:toddler' },
    { column = 'wheelchair' },
    { column = 'walking_disability' },
    { column = 'sitting_disability' },
    { column = 'blind' },
    { column = 'min_age' },
    { column = 'max_age' },

    { column = 'material' },
    { column = 'capacity' },
    { column = 'capacity:baby' },
    { column = 'height' },
    { column = 'width' },
    { column = 'incline' },
    { column = 'direction' },
    { column = 'orientation' },
    { column = 'step_count' },
    { column = 'handrail' },
    { column = 'handrail:center' },
    { column = 'handrail:left' },
    { column = 'handrail:right' },
    { column = 'covered' },
    { column = 'level' },
    { column = 'levels' },
    { column = 'colour' },

    { column = 'pump:status' },

    -- für sonstige Ausstattungsmerkmale, die keine Spielgeräte sind (z.B. Bänke, Sportflächen...)
    { column = 'amenity' },
    { column = 'barrier' },
    { column = 'leisure' },
    { column = 'natural' },
    { column = 'tourism' },

    { column = 'access' },
    { column = 'artwork_type' },
    { column = 'backrest' },
    { column = 'bicycle_parking' },
    { column = 'diameter_crown' },
    { column = 'genus' },
    { column = 'leaf_type' },
    { column = 'shelter_type' },
    { column = 'sport' },
    { column = 'surface' },
    { column = 'waste' },

    { column = 'check_date' }
}

-- 3) für ergänzende Lagebezeichnungen
-- findet separat im Importprozess statt
-- 4) für Schattenberechnung
-- findet separat im Importprozess für jeden Objekttyp einzeln statt (Bäume, Gebäude...)
-- 5) für Datenprobleme
-- findet separat im Importprozess statt

-- Kopien der Attribut-Tabellen erzeugen, um für jeden benötigten Geometrietyp eine passende Geometriespalte zu ergänzen
local geom_polygon = { column = 'geom', type = 'polygon', not_null = true }
local geom_way = { column = 'geom', type = 'linestring', not_null = true }
local geom_node = { column = 'geom', type = 'point', not_null = true }

local columns_playgrounds = { table.unpack(attributes_playground) }
local columns_playground_nodes = { table.unpack(attributes_playground) }

local columns_playground_equipment_polygon = { table.unpack(attributes_playground_equipment) }
local columns_playground_equipment_way = { table.unpack(attributes_playground_equipment) }
local columns_playground_equipment_node = { table.unpack(attributes_playground_equipment) }

table.insert(columns_playgrounds, geom_polygon)
table.insert(columns_playground_nodes, geom_node)

table.insert(columns_playground_equipment_polygon, geom_polygon)
table.insert(columns_playground_equipment_way, geom_way)
table.insert(columns_playground_equipment_node, geom_node)


-- Tabellen für die verschiedenen Geometrietypen definieren
-- 1) für Spielplätze
local playgrounds = osm2pgsql.define_table({
    name = 'playgrounds',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = columns_playgrounds
})

local playground_nodes = osm2pgsql.define_table({
    name = 'playground_nodes',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = columns_playground_nodes
})

-- 2) für Spielgeräte
local playground_equipment_polygon = osm2pgsql.define_table({
    name = 'playground_equipment_polygon',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = columns_playground_equipment_polygon
})

local playground_equipment_way = osm2pgsql.define_table({
    name = 'playground_equipment_way',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = columns_playground_equipment_way
})

local playground_equipment_node = osm2pgsql.define_table({
    name = 'playground_equipment_node',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = columns_playground_equipment_node
})

-- 3) für ergänzende Lagebezeichnungen
local sites = osm2pgsql.define_table({
    name = 'sites',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = {
        { column = 'leisure' },
        { column = 'name' },
        { column = 'geom', type = 'polygon', not_null = true }
    }
})

local highways = osm2pgsql.define_table({
    name = 'highways',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = {
        { column = 'highway' },
        { column = 'name' },
        { column = 'geom', type = 'linestring', not_null = true }
    }
})

-- 4) für Schattenobjekte
local buildings = osm2pgsql.define_table({
    name = 'buildings',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = {
        { column = 'building' },
        { column = 'building:levels' },
        { column = 'height' },
        { column = 'est_height' },
        { column = 'geom', type = 'polygon', not_null = true }
    }
})

local building_parts = osm2pgsql.define_table({
    name = 'building_parts',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = {
        { column = 'building:part' },
        { column = 'building:levels' },
        { column = 'height' },
        { column = 'est_height' },
        { column = 'geom', type = 'polygon', not_null = true }
    }
})

local trees = osm2pgsql.define_table({
    name = 'trees',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = {
        { column = 'natural' },
        { column = 'diameter_crown' },
        { column = 'height' },
        { column = 'est_height' },
        { column = 'geom', type = 'point', not_null = true }
    }
})

local forests = osm2pgsql.define_table({
    name = 'forests',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = {
        { column = 'natural' },
        { column = 'landuse' },
        { column = 'landcover' },
        { column = 'geom', type = 'polygon', not_null = true }
    }
})

-- 5) für Datenprobleme
local completeness = osm2pgsql.define_table({
    name = 'completeness',
    ids = { type = 'any', type_column = 'osm_type', id_column = 'osm_id' },
    columns = {
        { column = 'feature_class' },
        { column = 'feature_type' },
        { column = 'bug_message' },
        { column = 'bug_level' },

        -- -- Spielplätze ohne access oder Fotos
        -- { column = 'leisure' },
        -- { column = 'access' },
        -- { column = 'image' },
        -- { column = 'wikimedia_commons' },

        -- -- Spielplatzausstattung mit fehlenden Detailattributen
        -- { column = 'playground' },
        -- { column = 'amenity' },
        -- { column = 'leisure' },
        -- { column = 'height' }, -- Höhe: slide, climbingwall, climbing_pole
        -- { column = 'incline' }, -- Neigung/Richtung, falls Linie: slide, steps, climbing_slope, zipwire
        -- { column = 'material' }, -- Material: slide, climbingframe, structure, bench
        -- { column = 'capacity' }, -- Plätze: seesaw, swing, tire_swing, bicycle_parking
        -- { column = 'step_count' }, -- Stufenanzahl: steps, ladder
        -- { column = 'handrail' }, -- Haltevorrichtung: rope_traverse, climbing_slope
        -- { column = 'handrail:left' }, -- Haltevorrichtung: rope_traverse, climbing_slope
        -- { column = 'handrail:right' }, -- Haltevorrichtung: rope_traverse, climbing_slope
        -- { column = 'handrail:center' }, -- Haltevorrichtung: rope_traverse, climbing_slope
        -- { column = 'orientation' }, -- Bewegungsrichtung: sand_pulley
        -- { column = 'check_date' }, -- Prüfdatum: pump
        -- { column = 'backrest' }, -- Rückenlehne: bench
        -- { column = 'direction' }, -- Ausrichtung: bench
        -- { column = 'bicycle_parking' }, -- Fahrradständertyp: bicycle_parking
        -- { column = 'covered' }, -- Überdeckung: picnic_table
        -- { column = 'sport' }, -- Sportart: pitch
        -- { column = 'surface' }, -- Oberfläche: pitch

        -- -- Gebäude ohne Höhenangaben (für Schattenberechnung)
        -- { column = 'building' },
        -- { column = 'height' },
        -- { column = 'est_height' },
        -- { column = 'building:levels' },

        -- -- Bäume ohne Kronendurchmesser (für Schattenberechnung)
        -- { column = 'natural' },
        -- { column = 'diameter_crown' },

        { column = 'geom', type = 'point', not_null = true }
    }
})

-- Tabellen füllen
-- 1) für Spielplätze
function process_playground(object, geom, table)
    table:insert({
        access = object.tags.access,
        private = object.tags.private,

        name = object.tags.name,
        alt_name = object.tags.alt_name,
        loc_name = object.tags.loc_name,
        official_name = object.tags.official_name,
        old_name = object.tags.old_name,
        short_name = object.tags.short_name,

        image = object.tags.image,
        wikimedia_commons = object.tags.wikimedia_commons,
        wikipedia = object.tags.wikipedia,
        wikidata = object.tags.wikidata,

        ["addr:street"] = object.tags["addr:street"],
        ["addr:housenumber"] = object.tags["addr:housenumber"],
        ["addr:postcode"] = object.tags["addr:postcode"],
        ["addr:city"] = object.tags["addr:city"],
        ["addr:suburb"] = object.tags["addr:suburb"],

        operator = object.tags.operator,
        ["operator:type"] = object.tags["operator:type"],

        ["contact:website"] = object.tags["contact:website"],
        ["contact:phone"] = object.tags["contact:phone"],
        ["contact:email"] = object.tags["contact:email"],

        description = object.tags.description,
        ["description:de"] = object.tags["description:de"],
        note = object.tags.note,
        fixme = object.tags.fixme,

        playground = object.tags.playground,

        min_age = object.tags.min_age,
        max_age = object.tags.max_age,
        baby = object.tags.baby,
        ["provided_for:toddler"] = object.tags["provided_for:toddler"],

        wheelchair = object.tags.wheelchair,
        ["wheelchair:description"] = object.tags["wheelchair:description"],

        toilets = object.tags.toilets,
        ["toilets:wheelchair"] = object.tags["toilets:wheelchair"],

        protection_title = object.tags.protection_title,
        start_date = object.tags.start_date,
        check_date = object.tags.check_date,

        geom = geom
    })
end

-- 2) für Spielgeräte und Ausstattungsmerkmale
function process_playground_equipment(object, geom, table)
    table:insert({
        playground = object.tags.playground,
        ["playground:theme"] = object.tags["playground:theme"],
    
        name = object.tags.name,
        image = object.tags.image,
        description = object.tags.description,
        ["description:de"] = object.tags["description:de"],
        note = object.tags.note,
        fixme = object.tags.fixme,

        baby = object.tags.baby,
        ["provided_for:toddler"] = object.tags["provided_for:toddler"],
        wheelchair = object.tags.wheelchair,
        walking_disability = object.tags.walking_disability,
        sitting_disability = object.tags.sitting_disability,
        blind = object.tags.blind,
        min_age = object.tags.min_age,
        max_age = object.tags.max_age,
    
        material = object.tags.material,
        capacity = object.tags.capacity,
        ["capacity:baby"] = object.tags["capacity:baby"],
        height = object.tags.height,
        width = object.tags.width,
        incline = object.tags.incline,
        direction = object.tags.direction,
        orientation = object.tags.orientation,
        step_count = object.tags.step_count,
        handrail = object.tags.handrail,
        ["handrail:center"] = object.tags["handrail:center"],
        ["handrail:left"] = object.tags["handrail:left"],
        ["handrail:right"] = object.tags["handrail:right"],
        covered = object.tags.covered,
        level = object.tags.level,
        levels = object.tags.levels,
        colour = object.tags.colour,

        ["pump:status"] = object.tags["pump:status"],

        -- für sonstige Ausstattungsmerkmale, die keine Spielgeräte sind (z.B. Bänke, Sportflächen...)
        amenity = object.tags.amenity,
        barrier = object.tags.barrier,
        leisure = object.tags.leisure,
        natural = object.tags.natural,
        tourism = object.tags.tourism,

        access = object.tags.access,
        artwork_type = object.tags.artwork_type,
        backrest = object.tags.backrest,
        bicycle_parking = object.tags.bicycle_parking,
        diameter_crown = object.tags.diameter_crown,
        genus = object.tags.genus,
        leaf_type = object.tags.leaf_type,
        shelter_type = object.tags.shelter_type,
        sport = object.tags.sport,
        surface = object.tags.surface,
        waste = object.tags.waste,

        check_date = object.tags.check_date,

        geom = geom
    })
end

-- 3) für ergänzende Lagebezeichnungen
function process_sites(object, geom, table)
    table:insert({
        amenity = object.tags.amenity,
        leisure = object.tags.leisure,
        name = object.tags.name,
        geom = geom
    })
end

function process_highways(object, geom, table)
    table:insert({
        highway = object.tags.highway,
        name = object.tags.name,
        geom = geom
    })
end

-- 4) für Schattenobjekte
function process_buildings(object, geom, table)
    table:insert({
        building = object.tags.building,
        ["building:levels"] = object.tags["building:levels"],
        height = object.tags.height,
        est_height = object.tags.est_height,
        geom = geom
    })
end

function process_building_parts(object, geom, table)
    table:insert({
        ["building:part"] = object.tags["building:part"],
        ["building:levels"] = object.tags["building:levels"],
        height = object.tags.height,
        est_height = object.tags.est_height,
        geom = geom
    })
end

function process_trees(object, geom, table)
    table:insert({
        natural = object.tags.natural,
        height = object.tags.height,
        est_height = object.tags.est_height,
        diameter_crown = object.tags.diameter_crown,
        geom = geom
    })
end

function process_forests(object, geom, table)
    table:insert({
        natural = object.tags.natural,
        landuse = object.tags.landuse,
        landcover = object.tags.landcover,
        geom = geom
    })
end

-- 5) für Datenprobleme
function process_completeness(object, geom, table, feature_class, feature_type, bug_message, bug_level)
    table:insert({

        feature_class = feature_class,
        feature_type = feature_type,
        bug_message = bug_message,
        bug_level = bug_level,

        -- leisure = object.tags.leisure,
        -- access = object.tags.access,
        -- image = object.tags.image,
        -- wikimedia_commons = object.tags.wikimedia_commons,

        -- playground = object.tags.playground,
        -- amenity = object.tags.amenity,
        -- leisure = object.tags.leisure,
        -- height = object.tags.height,
        -- incline = object.tags.incline,
        -- material = object.tags.material,
        -- capacity = object.tags.capacity,
        -- step_count = object.tags.step_count,
        -- handrail = object.tags.handrail,
        -- ["handrail:left"] = object.tags["handrail:left"],
        -- ["handrail:right"] = object.tags["handrail:right"],
        -- ["handrail:center"] = object.tags["handrail:center"],
        -- orientation = object.tags.orientation,
        -- check_date = object.tags.check_date,
        -- backrest = object.tags.backrest,
        -- direction = object.tags.direction,
        -- bicycle_parking = object.tags.bicycle_parking,
        -- covered = object.tags.covered,
        -- sport = object.tags.sport,
        -- surface = object.tags.surface,

        -- building = object.tags.building,
        -- height = object.tags.height,
        -- est_height = object.tags.est_height,
        -- ["building:levels"] = object.tags["building:levels"],
        -- natural = object.tags.natural,
        -- diameter_crown = object.tags.diameter_crown,

        geom = geom
    })
end

-- Hilfsfunktion: prüft, ob sich ein Wert in einer Liste befindet
local function is_in(value, list)
    for i, val in ipairs(list) do
        if val == value then
            return true
        end
    end
    return false
end

-- Funktionen, die von osm2pgsql für jedes Objekt im OSM-Ausgangsdatensatz aufgerufen werden, um das Füllen der Tabellen zu initiieren (je nach Geometrietyp)
-- geschlossene Linien werden (je nach Objekttyp) als Polygone behandelt, nicht geschlossene als Linien
-- Relationen mit dem Typ "multipolygon" werden in Einzelteile zerlegt als Polygone behandelt

-- neben Spielgeräten einbezogene Ausstattungsmerkmale von Spielplätzen:
local amenity_features = {"bench", "bicycle_parking", "shelter", "waste_basket"}
local barrier_features = {"gate"}
local leisure_features = {"picnic_table", "pitch"}
local natural_features = {"shrub", "tree"}
local tourism_features = {"artwork"}

-- Linien/Flächen
function osm2pgsql.process_way(object)

    -- Spielplätze
    if object.tags.leisure == 'playground' and object.is_closed then
        process_playground(object, object:as_polygon(), playgrounds)
    end

    -- Spielgeräte und Ausstattungsmerkmale
    if object.tags.playground and object.tags.leisure ~= 'playground' then
        -- ein paar Geräte sollen als Linie betrachtet werden, auch wenn sie geschlossen sind
        local way_features = {"swing", "baby_swing", "basketswing", "tire_swing", "balancebeam", "rope_traverse", "stepping_stone", "stepping_post", "agility_trail", "balance", "monkey_bars", "spinning_circle", "horizontal_bar", "track"}
        if object.is_closed and not is_in(object.tags.playground, way_features) then
            process_playground_equipment(object, object:as_polygon(), playground_equipment_polygon)
        else
            process_playground_equipment(object, object:as_linestring(), playground_equipment_way)
        end
    end
    if is_in(object.tags.amenity, amenity_features) or is_in(object.tags.barrier, barrier_features) or is_in(object.tags.leisure, leisure_features) or is_in(object.tags.natural, natural_features) or is_in(object.tags.tourism, tourism_features) then
        -- geschlossene Sitzbanklinien sollen nicht als Fläche, sondern weiter als Linie betrachtet werden, außer sie sind explizit als Fläche getaggt
        if object.is_closed and not (object.tags.amenity == 'bench' and object.tags.area ~= 'yes') then
            process_playground_equipment(object, object:as_polygon(), playground_equipment_polygon)
        else
            process_playground_equipment(object, object:as_linestring(), playground_equipment_way)
        end
    end

    -- ergänzende Lagebezeichnungen (Sites, Straßen)
    if (object.tags.amenity or (object.tags.leisure and object.tags.leisure ~= 'playground') or object.tags.tourism) and object.tags.name and object.is_closed then
        process_sites(object, object:as_polygon(), sites)
    end
    if object.tags.highway and object.tags.name and object.tags.highway ~= 'bus_stop' and object.tags.highway ~= 'platform' then
        process_highways(object, object:as_linestring(), highways)
    end

    -- Schattenobjekte (Gebäude und Wälder)
    if object.tags.building and object.is_closed then
        process_buildings(object, object:as_polygon(), buildings)
    end
    if object.tags["building:part"] and object.is_closed then
        process_building_parts(object, object:as_polygon(), building_parts)
    end
    if (object.tags.natural == 'wood' or object.tags.landuse == 'forest' or object.tags.landcover == 'trees') and object.is_closed then
        process_forests(object, object:as_polygon(), forests)
    end

    -- Datenprobleme
    checkCompleteness(object, "way")
end

-- Relationen/Flächen
function osm2pgsql.process_relation(object)
    if object.tags.type == 'multipolygon' then
        local mp = object:as_multipolygon()

        -- Spielplätze
        if object.tags.leisure == 'playground' then
            for geom in mp:geometries() do
                process_playground(object, geom, playgrounds)
            end
        end

        -- Spielgeräte und Ausstattungsmerkmale
        if object.tags.playground and object.tags.leisure ~= 'playground' then
            for geom in mp:geometries() do
                process_playground_equipment(object, geom, playground_equipment_polygon)
            end
        end
        if is_in(object.tags.amenity, amenity_features) or is_in(object.tags.barrier, barrier_features) or is_in(object.tags.leisure, leisure_features) or is_in(object.tags.natural, natural_features) or is_in(object.tags.tourism, tourism_features) then
            for geom in mp:geometries() do
                process_playground_equipment(object, geom, playground_equipment_polygon)
            end
        end

        -- ergänzende Lagebezeichnungen (Sites, Straßen)
        if (object.tags.amenity or (object.tags.leisure and object.tags.leisure ~= 'playground') or object.tags.tourism) then
            for geom in mp:geometries() do
                process_sites(object, geom, sites)
            end
        end

        -- Schattenobjekte (Gebäude und Wälder)
        if object.tags.building then
            for geom in mp:geometries() do
                process_buildings(object, geom, buildings)
            end
        end
        if object.tags["building:part"] then
            for geom in mp:geometries() do
                process_building_parts(object, geom, building_parts)
            end
        end
        if object.tags.natural == 'wood' or object.tags.landuse == 'forest' or object.tags.landcover == 'trees' then
            for geom in mp:geometries() do
                process_forests(object, geom, forests)
            end
        end

        -- Datenprobleme
        checkCompleteness(object, "relation")
    end
end

-- Punkte
function osm2pgsql.process_node(object)

    -- Spielplätze
    if object.tags.leisure == 'playground' then
        process_playground(object, object:as_point(), playground_nodes)
    end

    -- Spielgeräte und Ausstattungsmerkmale
    if object.tags.playground and object.tags.leisure ~= 'playground' then
        process_playground_equipment(object, object:as_point(), playground_equipment_node)
    end
    if is_in(object.tags.amenity, amenity_features) or is_in(object.tags.barrier, barrier_features) or is_in(object.tags.leisure, leisure_features) or is_in(object.tags.natural, natural_features) or is_in(object.tags.tourism, tourism_features) then
        process_playground_equipment(object, object:as_point(), playground_equipment_node)
    end

    -- Schattenobjekte (Bäume)
    if (object.tags.natural == 'tree' or object.tags.natural == 'shrub') then
        process_trees(object, object:as_point(), trees)
    end

    -- Datenprobleme
    checkCompleteness(object, "node")
end

-- Prüfung auf Datenprobleme
-- Problemstufen ("bug_level"):
-- 1: Geometrische Probleme an Spielplätzen
-- 2: Geometrische Probleme an Spielgeräten
-- 3: Fehlende/fehlerhafte/unspezifische wichtige Basisinformationen
-- 4: Fehlende Detail-Attribute an Ausstattungsmerkmalen
-- 5: Fehlende Details zur Schattenberechnung an Gebäuden und Bäumen
-- 9: Spielplatz und Umfeld vollständig erfasst (später in SQL ermittelt)
function checkCompleteness(object, geom_type)
    if not object or not geom_type then
        return false
    end
    local bug_message1 = ""
    local bug_message2 = ""
    local bug_message3 = ""
    local bug_message4 = ""
    local bug_message5 = ""

    if object.tags.leisure == 'playground' then
        -- Spielplatz mit ungünstigem Geometrietyp
        if geom_type == 'node' then
            bug_message1 = bug_message1 .. "[1] Geometrie ungünstig (Punkt statt Fläche);"
        end
        if geom_type == 'way' and not object.is_closed then
            bug_message1 = bug_message1 .. "[1] Geometrie ungünstig (Linie statt Fläche);"
        end
        -- Spielplatz ohne Zugänglichkeitsinformation ('access')
        if not object.tags.access then
            bug_message3 = bug_message3 .. "[3P] Zugänglichkeit fehlt ('access');"
        end
        -- Öffentlicher Spielplatz ohne Foto ('image' oder 'wikimedia_commons')
        if object.tags.access == 'yes' and object.tags.image == null and object.tags.wikimedia_commons == null then
            bug_message4 = bug_message4 .. "[4F] Foto fehlt ('wikimedia_commons'/'image');"
        end
    end
    -- Spielgeräte
    if object.tags.playground then
        -- Spielplatzausstattung an der Spielplatzgeometrie erfasst statt separat
        if object.tags.leisure == 'playground' then
            bug_message1 = bug_message1 .. "[1] Spielgeräte sollten separat erfasst werden;"
        else
            -- Spielplatzausstattung mit ungünstigem Geometrietyp
            if geom_type == 'way' or geom_type == 'relation' then
                if (geom_type == 'way' and object.is_closed) or geom_type == 'relation' then
                    if is_in(object.tags.playground, {"slide", "zipwire"}) then
                        if geom_type == 'way' then
                            bug_message2 = bug_message2 .. "[2] Geometrie ungünstig (Fläche statt Linie);"
                        else
                            bug_message2 = bug_message2 .. "[2] Geometrie ungünstig (Multipolygon statt Linie);"
                        end
                    end
                else
                    if is_in(object.tags.playground, {"structure", "sandpit"}) then
                        bug_message2 = bug_message2 .. "[2] Geometrie ungünstig (Linie statt Fläche);"
                    end
                end
            end
            if geom_type == 'node' then
                if is_in(object.tags.playground, {"slide", "balancebeam", "zipwire", "track", "monkey_bars"}) then
                    bug_message2 = bug_message2 .. "[2] Geometrie ungünstig (Punkt statt Linie);"
                end
                if is_in(object.tags.playground, {"structure", "sandpit"}) then
                    bug_message2 = bug_message2 .. "[2] Geometrie ungünstig (Punkt statt Fläche);"
                end
            end
            -- semikolon-getrennte Werte vermeiden
            if string.find(object.tags.playground, ";") then
                bug_message3 = bug_message3 .. "[3] Semikolon-getrennte Werte vermeiden;"
            end
            -- unspezifische oder unplausible Neigung an Rutschen
            if object.tags.playground == 'slide' and object.tags.incline then
                if object.tags.incline == 'down' or object.tags.incline == 'up' then
                    bug_message4 = bug_message4 .. "[4] Ungenaues 'incline=" .. object.tags.incline .. "' statt Winkel;"
                end
                local clean_incline = object.tags.incline:gsub("[ °%%]", "")
                clean_incline = tonumber(clean_incline)
                if clean_incline then
                    clean_incline = math.abs(clean_incline)
                    if clean_incline > 60 or clean_incline < 5 then
                        bug_message4 = bug_message4 .. "[4] Unplausible Neigungsangabe '" .. object.tags.incline .. "';"
                    end
                end
            end
            -- unspezifischer playground-Wert
            if is_in(object.tags.playground, {"rotator", "water", "sand", "sand_play", "fixme", "stepping", "board", "tube", "yes"}) then
                bug_message3 = bug_message3 .. "[3F] Unspezifischer Wert 'playground=" .. object.tags.playground .. "';"
            end
            -- veralteter oder ungünstiger Geräte-Wert
            local dicouraged_tags = {
                ropebridge = "wobble_bridge",
                balance_rope = "rope_traverse",
                pole = "climbing_pole",
                firemans_pole = "climbing_pole",
                firemanpole = "climbing_pole",
                climbingpoles = "climbing_pole",
                sprinkler = "water_sprayer",
                tyre_swing = "tire_swing",
                sand_table = "table",
                ride = "ride_on",
                waterpump = "pump",
                swingy = "springy",
                sand_slide = "chute",
                stairs = "steps",
                horizontal_ladder = "monkey_bars",
                balance_blocks = "stepping_stone",
                stepping_stones = "stepping_stone",
                balancepoles = "stepping_post",
                slackline = "rope_traverse",
                sculpture = "artwork",
                statue = "artwork",
                springboard = "spring_board",
                climbing_net = "climbingframe",
                climbing_ramp = "climbing_slope",
                rope_ladder = "ladder",
                climbing_structure = "climbingframe",
                hill = "mound",
            }
            for old_value, new_value in pairs(dicouraged_tags) do
                if object.tags.playground == old_value then
                    bug_message3 = bug_message3 .. "[3F] Alter Wert '" .. old_value .. "' statt '" .. new_value .. "';"
                    break
                end
            end
            -- swing + material=tire/tyre durch tire_swing ersetzen
            if object.tags.playground == 'swing' and (object.tags.material == 'tire' or object.tags.material == 'tyre') then
                bug_message3 = bug_message3 .. "[3F] Alter Wert 'swing' + '" .. object.tags.material .. "' statt 'tire_swing';"
            end
        end
    end
    -- Ungünstige Geometrien an features
    -- Sportflächen (Fußball, Basketball etc.) nur als Punkt statt Fläche)
    if object.tags.leisure == 'pitch' and geom_type == 'node' and is_in(object.tags.sport, {"multi", "soccer", "basketball", "streetball", "soccer;basketball", "basketball;soccer", "volleyball", "beachvolleyball", "skateboard", "field_hockey", "tennis", "baseball"}) then
        bug_message2 = bug_message2 .. "[2] Geometrie ungünstig (Punkt statt Fläche);"
    end
    -- punktuelle Sportfeatures nicht als Punkt
    if object.tags.leisure == 'pitch' and (geom_type == 'way' or geom_type == 'relation') and is_in(object.tags.sport, {"table_tennis", "table_soccer", "chess", "nine_mens_morris"}) then
        if object.is_closed then
            bug_message2 = bug_message2 .. "[2] Geometrie ungünstig (Fläche statt Punkt);"
        else
            bug_message2 = bug_message2 .. "[2] Geometrie ungünstig (Linie statt Punkt);"
        end
    end
    -- Fehlende interessante Detail-Tags an Spielgeräten und Spielplatzausstattung
    local tagging_details = {
        playground = {
            climbingframe = {"height", "material"},
            climbingwall = {"height"},
            climbing_pole = {"height"},
            climbing_slope = {"incline", "handrail"},
            ladder = {"step_count"},
            rope_traverse = {"handrail"},
            pump = {"check_date"},
            sand_pulley = {"orientation"},
            seesaw = {"capacity"},
            slide = {"height", "incline", "material"},
            steps = {"incline", "step_count"},
            structure = {"material"},
            swing = {"capacity"},
            tire_swing = {"capacity"},
            zipwire = {"direction"},    
        },
        amenity = {
            bench = {"material", "backrest", "direction"},
            bicycle_parking = {"capacity", "bicycle_parking"},
        },
        leisure = {
            picnic_table = {"covered", "material"},
            pitch = {"surface", "sport"},
        }
        -- missing tags on playgrounds (e.g. access and image oder wikimedia_commons) are handled separate
    }
    -- TODO -- ist mindestens einer dieser Tags gesetzt, gilt es als ausreichend
    local multi_tags = {
        handrail = {"handrail:left", "handrail:right", "handrail:center"},
    }
    for key, feature_list in pairs(tagging_details) do
        if object.tags[key] then
            for feature, tag_list in pairs(feature_list) do
                if object.tags[key] == feature then
                    for i, tag in ipairs(tag_list) do
                        -- surface nicht auf punktuellen Sportfeatures prüfen, z.B. Schachtische
                        if key == 'leisure' and feature == 'pitch' and tag == 'surface' and geom_type == 'node' then goto continue end
                        if not object.tags[tag] then
                            bug_message4 = bug_message4 .. "[4D] Fehlendes Detailattribut: '" .. tag .. "';"
                        end
                        ::continue::
                    end
                end
            end
        end
    end
    -- Gebäude oder Bäume ohne Höhenangabe oder Kronendurchmesser (für Schattenberechnung)
    if object.tags.building and not (object.tags.height or object.tags.est_height or object.tags["building:levels"]) then
        bug_message5 = bug_message5 .. "[5H] Gebäudehöhe oder Stockwerksangabe fehlt;"
    end
    if (object.tags.natural == 'tree' or object.tags.natural == 'shrub') and not object.tags.diameter_crown then
        bug_message5 = bug_message5 .. "[5D] Kronendurchmesser 'diameter_crown' fehlt;"
    end

    local bug_level = null
    local bug_message = bug_message1 .. bug_message2 .. bug_message3 .. bug_message4 .. bug_message5
    if #bug_message1 > 0 then bug_level = 1
    elseif #bug_message2 > 0 then bug_level = 2
    elseif #bug_message3 > 0 then bug_level = 3
    elseif #bug_message4 > 0 then bug_level = 4
    elseif #bug_message5 > 0 then bug_level = 5
    end

    if #bug_message > 0 then
        local feature_class = ""
        local feature_type = ""    
        if object.tags.natural == 'tree' or object.tags.natural == 'shrub' then
            feature_class = "tree"
            feature_type = object.tags.natural
        end
        if object.tags.playground then
            feature_class = "device"
            feature_type = object.tags.playground
        end
        if object.tags.leisure then
            feature_class = "feature"
            feature_type = object.tags.leisure
        end
        if object.tags.amenity then
            feature_class = "feature"
            feature_type = object.tags.amenity
        end
        if object.tags.building then
            feature_class = "building"
            feature_type = "building"
        end
        if object.tags.leisure == 'playground' then
            feature_class = "playground"
            feature_type = "playground"
        end
        if feature_class then
            if geom_type == 'way' then
                if object.is_closed then
                    process_completeness(object, object:as_polygon():centroid(), completeness, feature_class, feature_type, bug_message, bug_level)
                else
                    process_completeness(object, object:as_linestring():centroid(), completeness, feature_class, feature_type, bug_message, bug_level)
                end
            else
                if geom_type == 'relation' and object.tags.type == 'multipolygon' then
                    process_completeness(object, object:as_multipolygon():centroid(), completeness, feature_class, feature_type, bug_message, bug_level)
                end
                if geom_type == 'node' then
                    process_completeness(object, object:as_point(), completeness, feature_class, feature_type, bug_message, bug_level)
                end
            end
        end
    end
end