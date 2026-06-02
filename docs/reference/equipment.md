# Supported Equipment Types

This page documents every equipment type that spieli recognises. The definitions live in two source files:

- `app/src/lib/objPlaygroundEquipment.js` — `objDevices`, `objFitnessStation`, `objFeatures`
- `app/src/lib/equipmentAttributes.js` — `pitchImages`

These objects drive map icon rendering, colour coding, display labels, attribute filters, and example images. An OSM tag not listed here still renders, but falls back to a grey icon, the raw tag value as the label, and no example image.

---

## Playground devices (`objDevices`)

Keyed by the OSM `playground=*` tag value. 85 entries.

### Entry fields

| Field | Required | Effect |
|---|---|---|
| `name_de` | Yes | German label shown in the equipment list and tooltip |
| `image` | No | Wikimedia Commons filename (`File:…`) for an example photo. Omitted → no image shown |
| `category` | No | Groups the device under a filter heading. See category list below |
| `filterable` | No | `true` → device appears as a sidebar filter checkbox |
| `filter_attr` | No | OSM sub-attributes exposed as filter controls (e.g. `["length", "height"]`). Only useful when `filterable: true` |

To add a new device, see [Add a Playground Device](../contributing/add-device.md).

### Stationary

| Key | Label | Filterable | Filter attrs |
|---|---|---|---|
| `slide` | Rutsche | ✓ | length, height |
| `seesaw` | Wippe | ✓ | |
| `springy` | Federwipptier | | |

### Structure parts

| Key | Label | Filterable | Filter attrs |
|---|---|---|---|
| `structure` | Spielstruktur | | |
| `bridge` | Brücke | | |
| `wobble_bridge` | Hängebrücke | ✓ | length |
| `platform` | Plattform | | |
| `steps` | Treppe | | |
| `ladder` | Leiter | | |

### Swings

| Key | Label | Filterable |
|---|---|---|
| `swing` | Schaukel | |
| `baby_swing` | Babyschaukel | |
| `basketswing` | Korbschaukel | ✓ |
| `tire_swing` | Reifenschaukel | |
| `rope_swing` | Tampenschaukel | |

### Balance

| Key | Label | Filterable |
|---|---|---|
| `agility_trail` | Bewegungsparcours | |
| `balancebeam` | Balancierbalken | |
| `rope_traverse` | Balancierseil | |
| `stepping_stone` | Trittsteine | |
| `stepping_post` | Trittpfosten | |

### Climbing

| Key | Label | Filterable | Filter attrs |
|---|---|---|---|
| `climbingframe` | Klettergerüst | ✓ | height |
| `climbingwall` | Kletterwand | ✓ | height |
| `climbing_slope` | Kletterrampe | | |
| `climbing_pole` | Kletterstange | | |
| `monkey_bars` | Hangelstrecke | | |

### Rotating

| Key | Label |
|---|---|
| `roundabout` | Karussell |
| `basketrotator` | Korbkarusell |
| `aerialrotator` | Hängedrehkreisel |
| `spinner` | Drehbrett |
| `spinning_disc` | Drehscheibe |
| `spinning_circle` | Drehring |
| `spinner_bowl` | Drehschale |

### Sand

| Key | Label | Filterable |
|---|---|---|
| `sandpit` | Sandkasten | |
| `chute` | Sandrohr | |
| `sieve` | Sieb | |
| `sand_wheel` | Sandrad | |
| `sand_seesaw` | Sandwippe | |
| `sand_pulley` | Sandaufzug | |
| `excavator` | Spielbagger | ✓ |
| `table` | Spieltisch | |

### Water

| Key | Label | Filterable |
|---|---|---|
| `splash_pad` | Wasserspritzanlage | |
| `pump` | Wasserpumpe | ✓ |
| `water_channel` | Wasserkanal | |
| `water_stream` | Wasserlauf | |
| `water_seesaw` | Wasserwippe | |
| `water_basin` | Wasserbecken | |
| `water_barrier` | Wasserbarriere | |
| `archimedes_screw` | Wasserschraube | |
| `water_wheel` | Wasserrad | |
| `water_cannon` | Wasserkanone | |
| `water_sprayer` | Wasserdüse | |

### Activity

| Key | Label |
|---|---|
| `horizontal_bar` | Reckstange |
| `parallel_bars` | Barren |
| `bannister_bars` | Stangenrutsche |
| `hamster_wheel` | Hamsterrolle |
| `exercise` | Fitnessgerät |

### Motion

| Key | Label | Filterable | Filter attrs |
|---|---|---|---|
| `zipwire` | Seilbahn | ✓ | length |
| `trampoline` | Trampolin | ✓ | |
| `cushion` | Hüpfkissen | | |
| `belt_bridge` | Hüpfbandbrücke | | |
| `spring_board` | Wackelbrett | | |
| `hopscotch` | Hüpfspiel | | |
| `track` | Rennstrecke | | |
| `sledding` | Rodelstrecke | | |

### Topographical

| Key | Label |
|---|---|
| `mound` | Spielhügel |
| `dome` | Halbkugel |

### Other

| Key | Label | Filterable |
|---|---|---|
| `activitypanel` | Spielwand | |
| `playhouse` | Spielhaus | |
| `teenshelter` | Unterstand | |
| `tunnel_tube` | Kriechtunnel | ✓ |
| `speaking_tube` | Sprechrohr | ✓ |
| `funnel_ball` | Trichterball | |
| `ball_pool` | Bällebad | |
| `ride_on` | Sitztier | |
| `marble_run` | Murmelspiel | |
| `map` | Landkarte | |
| `blackboard` | Tafel | |
| `musical_instrument` | Musikinstrument | |
| `seat` | Sitz | |
| `hammock` | Hängematte | ✓ |
| `youth_bench` | Jugendbank | |

### OSM fallback values

These keys cover mappers who use a generic tag value instead of a specific one. They have no example image.

| Key | Label | Category |
|---|---|---|
| `balance` | Balanciergerät | balance |
| `climbing` | Klettergerät | climbing |
| `rotator` | Rotationsgerät | rotating |
| `water` | Wasserspiele | water |
| `sand` | Sandspielelement | sand |

---

## Fitness stations (`objFitnessStation`)

Keyed by the OSM `fitness_station=*` tag value. 21 entries. These entries supply a German display label only — no image support, no filterable flag.

| Key | Label |
|---|---|
| `horizontal_bar` | Klimmzugstange |
| `parallel_bars` | Barren |
| `push_up` | Liegestützgerät |
| `sit_up` | Bauchtrainer |
| `balance_beam` | Balancierbalken |
| `elliptical_trainer` | Crosstrainer |
| `exercise_stairs` | Treppenstufen |
| `rowing` | Rudergerät |
| `bicycle` | Radergometer |
| `sign` | Informationsschild |
| `stepping_stone` | Trittsteine |
| `training_wall` | Trainingswall |
| `wall_bars` | Sprossenwand |
| `dip` | Dip-Station |
| `slalom_bars` | Slalomstangen |
| `stretching` | Streckgerät |
| `air_walker` | Luftläufer |
| `chest_press` | Brustpresse |
| `leg_press` | Beinpresse |
| `rotary_torso` | Rumpfrotation |
| `archery` | Bogenschießen |

---

## Non-device features (`objFeatures`)

These entries cover amenities and natural features that appear inside playground boundaries but are not `playground=*` devices. 15 entries. Each entry matches on a set of OSM tags; **more-specific entries must appear before more-general ones** so the matcher picks the right icon.

| Key | OSM tags | Label | Icon | Size |
|---|---|---|---|---|
| `artwork` | `tourism=artwork` | Kunstwerk | artwork | 12 |
| `bicycle_parking` | `amenity=bicycle_parking` | Fahrradständer | bicycle_parking | 16 |
| `bench_backrest` | `amenity=bench` + `backrest=yes` | Sitzbank | bench_backrest_yes | 12 |
| `bench` | `amenity=bench` | Sitzbank | bench_backrest_no | 12 |
| `gate` | `barrier=gate` | Eingangstor | gate | 12 |
| `shelter` | `amenity=shelter` | Unterstand | shelter | 12 |
| `picnic_table` | `leisure=picnic_table` | Picknicktisch | picnic_table | 12 |
| `table_tennis` | `leisure=pitch` + `sport=table_tennis` | Tischtennisplatte | table_tennis | 12 |
| `soccer` | `leisure=pitch` + `sport=soccer` | Bolzplatz | soccer | 12 |
| `basketball` | `leisure=pitch` + `sport=basketball` | Basketballfeld | basketball | 12 |
| `pitch` | `leisure=pitch` | Sportfeld | pitch | 20 |
| `shrub` | `natural=shrub` | Busch | shrub | 12 |
| `tree_evergreen` | `natural=tree` + `leaf_type=needleleaved` | Baum | tree_needleleaved | 12 |
| `tree` | `natural=tree` | Baum | tree_broadleaved | 12 |
| `waste_basket` | `amenity=waste_basket` | Abfallbehälter | waste_basket | 10 |

The `size` field controls the rendered icon size in pixels on the map.

---

## Sport pitch images (`pitchImages`)

Keyed by the OSM `sport=*` tag value on a `leisure=pitch` feature. Provides an example diagram or photo shown in the equipment detail panel. 17 entries.

| Key | Image (Wikimedia Commons) |
|---|---|
| `soccer` | `File:Association football pitch imperial.svg` |
| `basketball` | `File:Basketball court dimensions in meters.svg` |
| `table_tennis` | `File:Table tennis table blue.jpg` |
| `volleyball` | `File:Volleyball court with dimensions.svg` |
| `tennis` | `File:Hard tennis court 1.jpg` |
| `handball` | `File:Handball court metric.svg` |
| `badminton` | `File:Badminton court 8shuttle.svg` |
| `hockey` | `File:Field Hockey Pitch Dimensions.svg` |
| `field_hockey` | `File:Field Hockey Pitch Dimensions.svg` |
| `boules` | `File:Boules-coloured.jpg` |
| `petanque` | `File:Boules-coloured.jpg` |
| `multi` | `File:Multi-use games area.jpg` |
| `skateboard` | `File:Skatepark Vienna Praterstern 2015.jpg` |
| `bmx` | `File:BMX track Canberra.jpg` |
| `athletics` | `File:Athletics track.jpg` |
| `beachvolleyball` | `File:BeachvolleyballAthens04.jpg` |
| `climbing` | `File:Outdoor bouldering wall.jpg` |

---

## Fallback behaviour

An OSM tag not present in these objects still renders on the map and in the equipment list, but with reduced information:

- Map icon: grey fallback style
- Label: raw OSM tag value (no German translation)
- Example image: none

To add proper support for an unlisted type, follow [Add a Playground Device](../contributing/add-device.md) or [Add a Sport Pitch Type](../contributing/add-sport-type.md).
