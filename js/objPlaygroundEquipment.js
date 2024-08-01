//------------------------------------------
// objDevices:
// Objekt zur Beschreibung von Spielgeräten
//------------------------------------------
// - OSM-Wert für "playground" (key),
// - deutsche Übersetzung ("name_de"),
// - Foto der Gerätekategorie ("image"),
// - Übergeordnete Geräteklasse ("category")
//------------------------------------------

//------------------------------------------
// objFeatures:
// Objekt zur Beschreibung von anderen
// Ausstattungsmerkmalen von Spielplätzen
//------------------------------------------
// - Bezeichner (key),
// - OSM-Tagging ("tags"),
// - deutsche Übersetzung ("name_de"),
// - Icon für Kartendarstellung ("icon")
//------------------------------------------

export const objDevices = {
    slide: {
        name_de: "Rutsche",
        image: "File:Accessibleplay-Slide.jpg",
        category: "stationary",
        filterable: true,
        filter_attr: ["length", "height"],
    },
    seesaw: {
        name_de: "Wippe",
        image: "File:Seesaw-aa.jpg",
        category: "stationary",
        filterable: true,
    },
    springy: {
        name_de: "Federwipptier",
        image: "File:Springy horse.jpg",
        category: "stationary",
    },
    structure: {
        name_de: "Spielstruktur",
        image: "File:SunwardCohousingPlayStructure2005.jpg",
        category: "structure_parts",
    },
    bridge: {
        name_de: "Brücke",
        image: "File:Playground in Muchall Park, Wolverhampton - geograph.org.uk - 2735437.jpg",
        category: "structure_parts",
    },
    wobble_bridge: {
        name_de: "Hängebrücke",
        image: "File:Playground ropebridge Trusepark Berlin Neukölln.jpg",
        category: "structure_parts",
        filterable: true,
        filter_attr: ["length"],
    },
    platform: {
        name_de: "Plattform",
        image: "File:Playground structure wood toddler.jpg",
        category: "structure_parts",
    },
    steps: {
        name_de: "Treppe",
        image: "File:Playground steps wood step count 7 handrail.jpg",
        category: "structure_parts",
    },
    ladder: {
        name_de: "Leiter",
        image: "File:Playground ladder.jpg",
        category: "structure_parts",
    },
    swing: {
        name_de: "Schaukel",
        image: "File:Accessibleplay-Swing.jpg",
        category: "swing",
    },
    baby_swing: {
        name_de: "Babyschaukel",
        image: "File:Baby-swings-2.jpg",
        category: "swing",
    },
    basketswing: {
        name_de: "Korbschaukel",
        image: "File:Playground swing 03.jpg",
        category: "swing",
        filterable: true,
    },
    tire_swing: {
        name_de: "Reifenschaukel",
        image: "File:Tire swing, near Litchfield, Connecticut LCCN2012630791 (cropped).jpg",
        category: "swing",
    },
    rope_swing: {
        name_de: "Tampenschaukel",
        image: "File:Playground rope swing Zoologischer Garten Berlin.jpg",
        category: "swing",
    },
    agility_trail: {
        name_de: "Bewegungsparcours",
        image: "File:Agility_trail_for_kids.jpeg",
        category: "balance",
    },
    balancebeam: {
        name_de: "Balancierbalken",
        image: "File:Playground Balance beam.jpg",
        category: "balance",
    },
    rope_traverse: {
        name_de: "Balancierseil",
        image: "File:Playground balance rope handrail.jpg",
        category: "balance",
    },
    stepping_stone: {
        name_de: "Trittsteine",
        image: "File:Marine Park td (2019-05-24) 062 - Lenape Playground.jpg",
        category: "balance",
    },
    stepping_post: {
        name_de: "Trittpfosten",
        image: "File:Playground stepping poles Thomashöhe Berlin Neukölln.jpg",
        category: "balance",
    },
    climbingframe: {
        name_de: "Klettergerüst",
        image: "File:DeimosXL1.jpg",
        category: "climbing",
        filterable: true,
        filter_attr: ["height"],
    },
    climbingwall: {
        name_de: "Kletterwand",
        image: "File:Playground climbingwall.jpg",
        category: "climbing",
        filterable: true,
        filter_attr: ["height"],
    },
    climbing_slope: {
        name_de: "Kletterrampe",
        image: "File:Playground rope ladder.jpg",
        category: "climbing",
    },
    climbing_pole: {
        name_de: "Kletterstange",
        image: "File:Playground climbing pole height 2.jpg",
        category: "climbing",
    },
    monkey_bars: {
        name_de: "Hangelstrecke",
        image: "File:Playground monkey bars, hoops.jpg",
        category: "climbing",
    },
    roundabout: {
        name_de: "Karussell",
        image: "File:Manually powered carousel on a playground in Saint-Petersburg.JPG",
        category: "rotating",
    },
    basketrotator: {
        name_de: "Korbkarusell",
        image: "File:Playground Basket-Rotator Berlin Germany.jpg",
        category: "rotating",
    },
    aerialrotator: {
        name_de: "Hängedrehkreisel",
        image: "File:Hanging roundabout.jpg",
        category: "rotating",
    },
    spinner: {
        name_de: "Drehbrett",
        image: "File:Playground equipment spinner Rollbergsiedlung Berlin-Neukölln.jpg",
        category: "rotating",
    },
    spinning_disc: {
        name_de: "Drehscheibe",
        image: "File:Playground rotator Thomashöhe Berlin Neukölln.jpg",
        category: "rotating",
    },
    spinning_circle: {
        name_de: "Drehring",
        image: "File:Spinning_circle.jpg",
        category: "rotating",
    },
    spinner_bowl: {
        name_de: "Drehschale",
        image: "File:Spinner bowl in Springfield park, Guiseley (side view).jpg",
        category: "rotating",
    },
    sandpit: {
        name_de: "Sandkasten",
        image: "File:Zandbakw.jpg",
        category: "sand",
    },
    chute: {
        name_de: "Sandrohr",
        image: "File:Playground sand chute.jpg",
        category: "sand",
    },
    sieve: {
        name_de: "Sieb",
        image: "File:Playground sand sieve.jpg",
        category: "sand",
    },
    sand_wheel: {
        name_de: "Sandrad",
        image: "File:Playground sand wheel.jpg",
        category: "sand",
    },
    sand_seesaw: {
        name_de: "Sandwippe",
        image: "File:Playground sand seesaw.jpg",
        category: "sand",
    },
    sand_pulley: {
        name_de: "Sandaufzug",
        image: "File:Playground sand pulley Lichtenrader Straße Berlin Neukölln.jpg",
        category: "sand",
    },
    excavator: {
        name_de: "Spielbagger",
        image: "File:Playground excavator, unpowered.jpg",
        category: "sand",
        filterable: true,
    },
    splash_pad: {
        name_de: "Wasserspritzanlage",
        image: "File:Urbeach-high-park-splashpad.jpg",
        category: "water",
    },
    pump: {
        name_de: "Wasserpumpe",
        image: "File:Wasserspielplatz an der Schäferwiese 01.jpg",
        category: "water",
        filterable: true,
    },
    water_channel: {
        name_de: "Wasserkanal",
        image: "File:Playground water channels Schillerpromenade Berlin Neukölln.jpg",
        category: "water",
    },
    water_stream: {
        name_de: "Wasserlauf",
        image: "File:Playground water flow.jpg",
        category: "water",
    },
    water_seesaw: {
        name_de: "Wasserwippe",
        image: "File:Playground water seesaw Thomashöhe Berlin Neukölln.jpg",
        category: "water",
    },
    water_basin: {
        name_de: "Wasserbecken",
        image: "File:Playground water basin with drain and plug.jpg",
        category: "water",
    },
    water_barrier: {
        name_de: "Wasserbarriere",
        image: "File:Playground water barrier Berlin Neukoelln.jpg",
        category: "water",
    },
    archimedes_screw: {
        name_de: "Wasserschraube",
        image: "File:Norden Archimedische Schraube.jpg",
        category: "water",
    },
    water_wheel: {
        name_de: "Wasserrad",
        image: "File:Playground water wheel Ellricher Straße Berlin-Neukölln.jpg",
        category: "water",
    },
    water_cannon: {
        name_de: "Wasserkanone",
        image: "File:Playground water cannon.jpg",
        category: "water",
    },
    water_sprayer: {
        name_de: "Wasserdüse",
        image: "File:Farm Playground td (2018-10-30) 28.jpg",
        category: "water",
    },
    horizontal_bar: {
        name_de: "Reckstange",
        image: "File:Rekstok.JPG",
        category: "activity",
    },
    parallel_bars: {
        name_de: "Barren",
        image: "File:Shun Lee Estate Playground, Gym Zone and Basketball Court.jpg",
        category: "activity",
    },
    bannister_bars: {
        name_de: "Stangenrutsche",
        image: "File:Playground parallel bars Mahlower Straße Berlin Neukölln.jpg",
        category: "activity",
    },
    hamster_wheel: {
        name_de: "Hamsterrolle",
        image: "File:Kaiserslautern Volkspark Hamsterrolle.jpg",
        category: "activity",
    },
    activitypanel: {
        name_de: "Spielwand",
        image: "File:Szwedy - plac zabaw - kółko i krzyżyk.jpg",
        category: "other",
    },
    exercise: {
        name_de: "Fitnessgerät",
        image: "File:Outdoor gym in Parque de Bateria, Torremolinos.JPG",
        category: "activity",
    },
    zipwire: {
        name_de: "Seilbahn",
        image: "File:Ropeway play.jpg",
        category: "motion",
        filterable: true,
        filter_attr: ["length"],
    },
    trampoline: {
        name_de: "Trampolin",
        image: "File:playground_trampoline.jpg",
        category: "motion",
        filterable: true,
    },
    cushion: {
        name_de: "Hüpfkissen",
        image: "File:Hüpfkissen.jpg",
        category: "motion",
    },
    belt_bridge: {
        name_de: "Hüpfbandbrücke",
        image: "File:Playground belt bridge.jpg",
        category: "motion",
    },
    spring_board: {
        name_de: "Wackelbrett",
        image: "File:Playground springs in Obermenzing 05.jpg",
        category: "motion",
    },
    playhouse: {
        name_de: "Spielhaus",
        image: "File:Playhouse.jpg",
        category: "other",
    },
    teenshelter: {
        name_de: "Unterstand",
        image: "File:Teen shelter near former coastguard lookout, Watchet - geograph.org.uk - 1714960.jpg",
        category: "other",
    },
    tunnel_tube: {
        name_de: "Kriechtunnel",
        image: "File:Example of tunnel tube on a playground.jpg",
        category: "other",
        filterable: true,
    },
    speaking_tube: {
        name_de: "Sprechrohr",
        image: "File:Speaking Tube - Garden Exhibit - NCSM - Kolkata 2016-06-02 4046.JPG",
        category: "other",
        filterable: true,
    },
    hopscotch: {
        name_de: "Hüpfspiel",
        image: "File:Hinkelbaan tegels.jpg",
        category: "motion",
    },
    funnel_ball: {
        name_de: "Trichterball",
        image: "File:Funnel_ball.jpg",
        category: "other",
    },
    ball_pool: {
        name_de: "Bällebad",
        image: "File:At children's level.jpg",
        category: "other",
    },
    ride_on: {
        name_de: "Sitztier",
        image: "File:Playground riding animal Thomashöhe Berlin Neukölln.jpg",
        category: "other",
    },
    track: {
        name_de: "Rennstrecke",
        image: "File:Playground track Buschkrugallee-Havermannstraße Berlin Britz.jpg",
        category: "motion",
    },
    marble_run: {
        name_de: "Murmelspiel",
        image: "File:Rachau Wipfelwanderweg 75.jpg",
        category: "other",
    },
    map: {
        name_de: "Landkarte",
        image: "File:Playground Map, Washington Elementary.jpg",
        category: "other",
    },
    blackboard: {
        name_de: "Tafel",
        image: "File:Playground chalk board.jpg",
        category: "other",
    },
    musical_instrument: {
        name_de: "Musikinstrument",
        image: "File:Play xylophone in a playground.jpeg",
        category: "other",
    },
    table: {
        name_de: "Spieltisch",
        image: "File:Playground table Herrfurthstraße Berlin Neukölln.jpg",
        category: "sand",
    },
    seat: {
        name_de: "Sitz",
        image: "File:Playground seat Hattenheimer Straße Berlin Tempelhof.jpg",
        category: "other",
    },
    hammock: {
        name_de: "Hängematte",
        image: "File:Playground hammock.jpg",
        category: "other",
        filterable: true,
    },
    sledding: {
        name_de: "Rodelstrecke",
        image: "File:Prangli lapsed kelgutamas.jpg",
        category: "motion",
    },
    youth_bench: {
        name_de: "Jugendbank",
        image: "File:Youth_bench.jpg",
        category: "other",
    },
    mound: {
        name_de: "Spielhügel",
        image: "File:Hunters Point South Pk td (2019-06-10) 069 - Playground.jpg",
        category: "topographical",
    },
    dome: {
        name_de: "Halbkugel",
        image: "File:Playground dome metal.jpg",
        category: "topographical",
    },
    // OSM-Fallback-Values
    balance: {
        name_de: "Balanciergerät",
        image: false,
        category: "balance",
    },
    climbing: {
        name_de: "Klettergerät",
        image: false,
        category: "climbing",
    },
    rotator: {
        name_de: "Rotationsgerät",
        image: false,
        category: "rotating",
    },
    water: {
        name_de: "Wasserspiele",
        image: false,
        category: "water",
    },
    sand: {
        name_de: "Sandspielelement",
        image: false,
        category: "sand",
    },
}

// Hinweis: Speziellere Features müssen sich in der Reihenfolge der Einträge immer _vor_ allgemeineren Features befinden, um korrekt differenziert zu werden
// z.B. amenity=bench + backrest=yes vor amenity=bench, damit letzteres nur für Sitzbänke greift, die nicht mit backrest=yes getaggt sind
export const objFeatures = {
    artwork: {
        tags: {
            tourism: "artwork",
        },
        name_de: "Kunstwerk",
        icon: "artwork",
        size: 12,
    },
    bicycle_parking: {
        tags: {
            amenity: "bicycle_parking",
        },
        name_de: "Fahrradständer",
        icon: "bicycle_parking",
        size: 16,
    },
    bench_backrest: {
        tags: {
            amenity: "bench",
            backrest: "yes",
        },
        name_de: "Sitzbank",
        icon: "bench_backrest_yes",
        size: 12,
    },
    bench: {
        tags: {
            amenity: "bench",
        },
        name_de: "Sitzbank",
        icon: "bench_backrest_no",
        size: 12,
    },
    gate: {
        tags: {
            barrier: "gate",
        },
        name_de: "Eingangstor",
        icon: "gate",
        size: 12,
    },
    shelter: {
        tags: {
            amenity: "shelter",
        },
        name_de: "Unterstand",
        icon: "shelter",
        size: 12,
    },
    picnic_table: {
        tags: {
            leisure: "picnic_table",
        },
        name_de: "Picknicktisch",
        icon: "picnic_table",
        size: 12,
    },
    table_tennis: {
        tags: {
            leisure: "pitch",
            sport: "table_tennis",
        },
        name_de: "Tischtennisplatte",
        icon: "table_tennis",
        size: 12,
    },
    soccer: {
        tags: {
            leisure: "pitch",
            sport: "soccer",
        },
        name_de: "Bolzplatz",
        icon: "soccer",
        size: 12,
    },
    basketball: {
        tags: {
            leisure: "pitch",
            sport: "basketball",
        },
        name_de: "Basketballfeld",
        icon: "basketball",
        size: 12,
    },
    pitch: {
        tags: {
            leisure: "pitch",
        },
        name_de: "Sportfeld",
        icon: "pitch",
        size: 20,
    },
    shrub: {
        tags: {
            natural: "shrub",
        },
        name_de: "Busch",
        icon: "shrub",
        size: 12,
    },
    tree_evergreen: {
        tags: {
            natural: "tree",
            leaf_type: "needleleaved",
        },
        name_de: "Baum",
        icon: "tree_needleleaved",
        size: 12,
    },
    tree: {
        tags: {
            natural: "tree",
        },
        name_de: "Baum",
        icon: "tree_broadleaved",
        size: 12,
    },
    waste_basket: {
        tags: {
            amenity: "waste_basket",
        },
        name_de: "Abfallbehälter",
        icon: "waste_basket",
        size: 10,
    },
}