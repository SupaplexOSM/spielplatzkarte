//---------------------------------------------------------------------------------------------------//
// Erzeugt Popups bei Hover mit Kurzinfos zu Spielplätzen, Spielgeräten oder über der Schattenmatrix //
//---------------------------------------------------------------------------------------------------//

import 'bootstrap/dist/css/bootstrap.min.css';
import { Popover } from 'bootstrap';

import { getPlaygroundTitle, getPlaygroundLocation } from '../js/selectPlayground.js';
import { objDevices, objFeatures } from '../js/objPlaygroundEquipment.js';

// Popups mit Infos zu Spielgeräten anzeigen
export function showPopup(type, popup, coordinate, feature) {

    const element = popup.getElement();
    var popover = Popover.getInstance(element);
    var title = null;
    var content = null;

    // Popup für Spielplätze
    if (type == 'playground') {
        var attr = feature.properties;
        title = getPlaygroundTitle(attr);
        content = `<i>${getPlaygroundLocation(attr)}</i>`;
    }

    // Popup für Datenprobleme
    if (type == 'issues') {
        title = feature.properties.feature_class;
        var feature_type = feature.properties.feature_type;
        if (title == 'device' && feature_type in objDevices) {
            title = objDevices[feature_type]["name_de"];
        } else if (title == 'feature') {
            featLoop: for (var feat in objFeatures) {
                var objTags = objFeatures[feat]["tags"];
                for (var key in objTags) {
                    if (feature_type != objTags[key]) {
                        continue featLoop;
                    }
                }
                title = objFeatures[feat]["name_de"];
                break;
            }
        } else {
            if (title in objIssueFeatures) {
                title = objIssueFeatures[title];
            }
        }

        content = "";
        var bug_messages = feature.properties.bug_message.split(";")
        bug_messages.forEach(function(message) {
            if (message) {
                var message_parts = message.split("] ");
                var icon = message_parts[0].replace("[", "");
                if (icon in objIssueIcons) {
                    icon = objIssueIcons[icon];
                } else {
                    icon = objIssueIcons[1];
                }
                icon = `<img class="mb-1" src="../img/icons/completeness/${icon}.png" alt="Icon" width="14" height="14">`
                content += `<p class="p-0 m-0" style="line-height: 24px !important"><small>${icon} ${message_parts[1]}</small></p>`;
            }
        });
    }
    
    // Popup für Spielplatzausstattung
    if (type == 'equipment') {
        // Titel entspricht einer deutschen Übersetzung des Spielgeräts/Ausstattungsmerkmals
        if (feature.get('playground')) {
            var name = feature.get('playground');
            if (!name) {
                return;
            }
            title = name;
            if (name in objDevices) {
                title = objDevices[name]["name_de"];
            }    
        } else {
            featLoop: for (var feat in objFeatures) {
                var objTags = objFeatures[feat]["tags"];
                for (var key in objTags) {
                    if (feature.get(key) != objTags[key]) {
                        continue featLoop;
                    }
                }
                title = objFeatures[feat]["name_de"];
                break;
            }
        }

        // Weitere Attribute auslesen und im Content des Popups auflisten
        content = getEquipmentAttributes(feature);
    }

    popup.setPosition(coordinate);

    // Popover als Bootstrap-Element erstellen
    if (popover) {
        popover.dispose();
    }

    if (!title && !content) {
        return;
    }
    if (!title) {
        title = 'Unbekanntes Objekt';
    }

    // TODO: Popover nach unten (placement='bottom') ausrichten, falls Koordinaten der Popover-Position auf Bildschirmpixel umgerechnet zu weit in der Titelleiste liegen
    popover = new Popover(element, {
        animation: false,
        container: element,
        content: content,
        html: true,
        placement: 'top',
        title: title
    });
    popover.show();
}

// Erzeugung des html-Contents für Equipment-Popups mit Details zu deren Attributen
//----------------------------------------------------------------------------------

// TODO: Noch nicht alle Attribute aus dem Datenbankimport werden berücksichtigt

function getEquipmentAttributes (feature) {
    var content = [];

    // Attribute von Spielgeräten
    //----------------------------

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
    var covered = feature.get('covered');
    switch (covered) {
        case "yes":
            content.push(`überdacht`);
            break;
        case "no":
            content.push(`nicht überdacht`);
            break;
    }

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

    // Attribute von anderen Ausstattungsmerkmalen
    //---------------------------------------------

    // Rückenlehne (Sitzbänke)
    var backrest = feature.get('backrest');
    switch (backrest) {
        case "yes":
            content.push(`mit Rückenlehne`);
            break;
        case "no":
            content.push(`ohne Rückenlehne`);
            break;
    }

    // Fahrradständertyp
    var bicycle_parking = feature.get('bicycle_parking');
    switch (bicycle_parking) {
        case "stands":
            content.push(`Art: Fahrradbügel`);
            break;
        case "wall_loops":
            content.push(`Art: Felgenkiller`);
            break;
    }

    // Sportart (von Sportfeldern, außer, wo sie bereits explizit als Titel des Popups verwendet wird)
    var sport = feature.get('sport');
    if (sport && sport != 'table_tennis' && sport != 'soccer' && sport != 'basketball') {
        if (sport in objSport) {
            sport = objSport[sport];
        }
        content.push(`Sportart: ${sport}`);
    }

    // Oberflächenbelag (z.B. von Sportfeldern)
    var surface = feature.get('surface');
    if (surface) {
        if (surface in objSurface) {
            surface = objSurface[surface];
        }
        content.push(`Oberflächenbelag: ${surface}`);
    }

    // Baumkronendurchmesser, Baumart
    var diameter_crown = feature.get('diameter_crown');
    if (diameter_crown) {
        content.push(`Kronendurchmesser: ${diameter_crown} Meter`);
    }
    var leaf_type = feature.get('leaf_type');
    switch (leaf_type) {
        case "broadleaved":
            content.push(`Blattart: Laubbaum`);
            break;
        case "needleleaved":
            content.push(`Blattart: Nadelbaum`);
            break;
    }
    var genus = feature.get('genus');
    if (genus) {
        if (genus in objGenus) {
            genus = objGenus[genus];
        }
        content.push(`Baumart: ${genus}`);
    }

    // Kunstwerk-Typ
    var artwork_type = feature.get('artwork_type');
    if (artwork_type) {
        if (artwork_type in objArtwork) {
            artwork_type = objArtwork[artwork_type];
        }
        content.push(`Typ: ${artwork_type}`);
    }

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

// Value-Übersetzungslisten
//--------------------------

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

// Key:sport (Sportart)
const objSport = {
    "soccer;basketball": "Fußball, Basketball",
    "basketball;soccer": "Fußball, Basketball",
    athletics: "Leichtathletik",
    beachvolleyball: "Beachvolleyball",
    bmx: "BMX",
    boules: "Boule",
    chess: "Schach",
    climbing: "Klettern",
    field_hockey: "Hockey",
    fitness: "Fitness",
    gymnastics: "Gymnastik",
    multi: "verschiedene",
    nine_mens_morris: "Mühle",
    running: "Laufsport",
    skateboard: "Skateboarding",
    table_soccer: "Tischfußball",
    tennis: "Tennis",
    toboggan: "Rodeln",
    volleyball: "Volleyball",
}

// Key:surface (Oberflächenbelag)
const objSurface = {
    acrylic: "Acrylharz",
    artificial_turf: "Kunstrasen",
    asphalt: "Asphalt",
    bricks: "Ziegelstein",
    carpet: "Teppich",
    clay: "Asche",
    cobblestone: "Kopfsteinpflaster",
    compacted: "verdichtete Deckschicht",
    concrete: "Beton",
    "concrete:lanes": "Betonspurbahn",
    "concrete:plates": "Betonplatten",
    dirt: "Erde",
    earth: "Erde",
    fine_gravel: "Splitt",
    grass: "Gras",
    grass_paver: "Rasengittersteine",
    gravel: "Schotter",
    ground: "Erde",
    metal: "Metall",
    metal_grid: "Metallgitter",
    mud: "Schlamm",
    paved: "versiegelt",
    paving_stones: "Pflastersteine",
    pebblestone: "Kies",
    plastic: "Kunststoff",
    rock: "Stein",
    rubber: "Gummi",
    sand: "Sand",
    sett: "Kopfsteinpflaster",
    stepping_stones: "Trittsteine",
    tartan: "Tartan",
    unhewn_cobblestone: "Rohes Kopfsteinpflaster",
    unpaved: "unversiegelt",
    wood: "Holz",
    woodchips: "Holzhackschnitzel",
}

// Key:genus (Baumart)
const objGenus = {
    Abies: "Tanne",
    Acer: "Ahorn",
    Aesculus: "Rosskastanie",
    Agathis: "Kauri-Baum",
    Ailanthus: "Götterbaum",
    Alnus: "Erle",
    Amelanchier: "Felsenbirne",
    Atropa: "Tollkirsche",
    Betula: "Birke",
    Carpinus: "Hainbuche",
    Castanea: "Kastanie",
    Catalpa: "Trompetenbaum",
    Celtis: "Zürgelbaum",
    Cercis: "Judasbaum",
    Cornus: "Hartriegel",
    Corylus: "Haselnuss",
    Crataegus: "Weißdorn",
    Fagus: "Buche",
    Fraxinus: "Esche",
    Ginkgo: "Ginkgo",
    Ilex: "Ilex",
    Juglans: "Walnuss",
    Juniperus: "Wacholder",
    Larix: "Lärche",
    Malus: "Apfel",
    Picea: "Fichte",
    Pinus: "Kiefer",
    Platanus: "Platane",
    Populus: "Pappel",
    Prunus: "Kirsche",
    Pyrus: "Birne",
    Quercus: "Eiche",
    Robinia: "Robinie",
    Salix: "Weide",
    Sorbus: "Mehlbeere",
    Taxus: "Eibe",
    Tilia: "Linde",
}

// Key:artwork_type (Kunstwerktyp)
const objArtwork = {
    bust: "Büste",
    graffiti: "Graffiti",
    installation: "Installation",
    mural: "Wandmalerei",
    painting: "Gemälde",
    sculpture: "Skulptur",
    statue: "Statue",
    stone: "Stein",
}

// Datentyp für Datenprobleme
const objIssueFeatures = {
    playground: "Spielplatz",
    device: "Spielgerät",
    feature: "Ausstattungsmerkmal",
    tree: "Baum",
    building: "Gebäude",
}

// Icons für Datenprobleme
const objIssueIcons = {
    "1": "warning1",
    "2": "warning2",
    "3": "warning1",
    "3P": "warning1",
    "3F": "warning2",
    "4": "unknown",
    "4F": "image",
    "4D": "plus",
    "5H": "height",
    "5D": "diameter",
}