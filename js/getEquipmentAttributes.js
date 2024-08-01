//-------------------------------------------------------------------
// Generiert Popover-Content mit Attributen des Spielplatzequipments
//-------------------------------------------------------------------

// TODO: Noch nicht alle Attribute aus dem Datenbankimport werden berücksichtigt

function getEquipmentAttributes (feature) {
    var content = [];

    // Motiv
    var playground_theme = feature.get('playground:theme');
    if (playground_theme && playground_theme != "playground") {
        if (playground_theme in objPlaygroundTheme) {
            playground_theme = objPlaygroundTheme[playground_theme];
        }
        content.push(`Motiv: ${playground_theme}`);
    }

    // Plätze
    var capacity = feature.get('capacity');
    if (capacity) {
        content.push(`Plätze: ${capacity}`);
    }
    var capacity_baby = feature.get('capacity:baby');
    if (capacity_baby) {
        content.push(`Babyplätze: ${capacity_baby}`);
    }

    // Höhe
    var height = feature.get('height');
    if (height) {
        height = height.replace(" ", "").toLowerCase();
        if (height.includes("cm")) {
            height = height.replace("cm", "");
            if (!isNaN(height)) {
                height = height / 100
            }            
        }
        var str = `Höhe: ${height}`;
        if (!isNaN(height)) {
            str += " Meter";
        }
        content.push(str.replace(".", ","));
    }

    // Breite
    var width = feature.get('width');
    if (width) {
        width = width.replace(" ", "").toLowerCase();
        if (width.includes("cm")) {
            width = width.replace("cm", "");
            if (!isNaN(width)) {
                width = width / 100
            }            
        }
        var str = `Breite: ${width}`;
        if (!isNaN(width)) {
            str += " Meter";
        }
        content.push(str.replace(".", ","));
    }

    // Länge (ist immer eine metrische Gleitkommazahl, da im Postprozessing/PostGIS ermittelt)
    var length = feature.get('length');
    if (length) {
        var str = `Länge: ${length.toString().replace(".", ",")} Meter`;
        content.push(str.replace(".", ","));
    }
    
    // Neigung
    var incline = feature.get('incline');
    if (incline && incline != "up" && incline != "down") { // nur numerische Werte verarbeiten
        // mögliche Leerzeichen vor der Einheit entfernen und mögliche Einheiten in Kleinbuchstaben
        incline = incline.replace(" ", "").toLowerCase();
        // Einheitenzeichen für Zahlenprüfung ersetzen
        incline = incline.replace(/°|grad/g, 'degrees');
        incline = incline.replace(/%|prozent/g, 'percent');

        // Ursprungseinheit festhalten
        var inclineUnit = "degrees";
        if (incline.includes("percent")) {
            inclineUnit = "percent";
        }

        // Einheitenbezeichner entfernen und Neigungszahl ermitteln
        var inclineValue = incline.replace(/percent|degrees/g, '');
        if (!isNaN(inclineValue)) {
            inclineValue = Math.abs(inclineValue);
            // Ggf. Prozent in Grad umrechnen
            if (inclineUnit == "percent") {
                inclineValue = (inclineValue / 100) * 360;
            }
            content.push(`Neigung: ${inclineValue} Grad`);
        }
    }

    // Ausrichtung (horizontal / vertical)
    // orientation

    // Stufenanzahl
    var step_count = feature.get('step_count');
    if (step_count) {
        content.push(`Stufenanzahl: ${step_count}`);
    }

    // Handlauf (keiner / vorhanden / links / rechts / beidseitig / mittig)
    // handrail
    // handrail:center
    // handrail:left
    // handrail:right

    // Überdacht
    // covered

    // Befindet sich auf Ebene
    // level

    // Ebenenanzahl
    // levels

    // Material
    var material = feature.get('material');
    if (material) {
        if (material in objMaterial) {
            material = objMaterial[material];
        }
        content.push(`Material: ${material}`);
    }

    // Farbe
    // colour

    // Status
    var pump_status = feature.get('pump:status');
    if (pump_status) {
        if (pump_status in objStatus) {
            pump_status = objStatus[pump_status];
        }
        content.push(`Status: ${pump_status}`);
    }

    // Zielgruppe
    // baby
    var baby = feature.get('baby');
    if (baby == 'yes') {
        content.push(`für Babys geeignet`);
    }

    // provided_for:toddler
    var toddler = feature.get('provided_for:toddler');
    if (toddler == 'yes') {
        content.push(`für Kleinkinder geeignet`);
    }

    // min_age
    // max_age

    // Barrierefreiheit
    // wheelchair
    var wheelchair = feature.get('wheelchair');
    if (wheelchair == 'yes') {
        content.push(`Rollstuhlgerecht`);
    }

    // walking_disability
    // sitting_disability
    // blind

    // Foto
    // image // TODO noch nicht berücksichtigt

    // Zuletzt überprüft
    // nur bei Objekten mit einem Funktionsstatus anzeigen
    if (pump_status) {
        var check_date = feature.get('check_date');
        if (check_date) {
            content.push(`Zuletzt überprüft: ${check_date}`);
        }
    }

    // Weitere Hinweise
    // description
    // description:de
    // note
    // fixme

    // Content als html-Liste erstellen
    var contentHtml = "";
    if (content.length) {
        contentHtml += "<ul>";
        content.forEach( function(item) {
            contentHtml += "<li>";
            contentHtml += item;
            contentHtml += "</li>";
        });
        contentHtml += "</ul>";
    }

    return contentHtml;
}

export default getEquipmentAttributes;

// Key:material (Material)
const objMaterial = {
    wood: "Holz",
    metal: "Metall",
    steel: "Stahl",
    aluminium: "Aluminium",
    plastic: "Kunststoff",
    stone: "Stein",
    sandstone: "Sandstein",
    concrete: "Beton",
    brick: "Ziegelstein",
    granite: "Granit",
    rope: "Seil",
    rubber: "Gummi",
    chain: "Kette",
    sand: "Sand"
}

// Key:playground:theme (Motiv)
// TODO: Tool bauen, um in der Datenbank auftauchende, nicht übersetzte playground:themes aufzulisten
const objPlaygroundTheme = {
    animal: "Tier",
    bicycle: "Fahrrad",
    boat: "Boot",
    camel: "Kamel",
    car: "Auto",
    carrot: "Karotte",
    castle: "Burg",
    construction: "Baustelle",
    dragon: "Drache",
    duck: "Ente",
    dungeon: "Burgverlies",
    elephant: "Elefant",
    farm: "Farm",
    fish: "Fisch",
    flower: "Blume",
    helicopter: "Hubschrauber",
    horse: "Pferd",
    house: "Haus",
    ice_cream: "Eis",
    indian: "Indianer",
    jungle: "Jungle",
    lama: "Lama",
    lighthouse: "Leuchtturm",
    locomotive: "Lokomotive",
    luggage: "Gepäck",
    mammoth: "Mammut",
    mushroom: "Pilz",
    ocean: "Ozean",
    palace: "Palast",
    plane: "Flugzeug",
    rainbow: "Regenbogen",
    rock: "Felsen",
    seal: "Robbe",
    sheep: "Schaf",
    ship: "Schiff",
    snake: "Schlange",
    spiderweb: "Spinnenweben",
    sport: "Sport",
    tent: "Zelt",
    tower: "Turm",
    train: "Eisenbahn",
    wagon: "Waggon",
    water: "Wasser",
    western: "Western",
    whale: "Wal",
    windmill: "Windmühle",
}

// Key:pump:status (Status)
const objStatus = {
    ok: "OK",
    broken: "kaputt",
    missing_beam: "kaputt",
    out_of_order: "außer Betrieb",
    locked: "verschlossen",
    blocked: "blockiert"
}