## ADDED Requirements

### Requirement: Pitch list label handles multi-value sport tags
The equipment list SHALL correctly render a pitch label when `sport` contains multiple semicolon-separated values by translating each value individually and joining them with ` / `.

#### Scenario: Two known sports
- **WHEN** a pitch feature has `sport = "skateboard;bmx"`
- **THEN** the list label displays `"Skate park / BMX track"` (EN) or `"Skatepark / BMX-Bahn"` (DE)

#### Scenario: Mix of known and unknown sports
- **WHEN** a pitch feature has `sport = "cycling;kick_scooter;unknown_sport"`
- **THEN** known sports are translated and unknown sports are shown as their raw OSM value, all joined with ` / `

#### Scenario: Single known sport unchanged
- **WHEN** a pitch feature has `sport = "soccer"`
- **THEN** the list label displays the existing single-sport translation (no regression)

#### Scenario: No sport tag
- **WHEN** a pitch feature has no `sport` property
- **THEN** the list label displays the generic pitch default label

### Requirement: Common missing sport keys are translated
The locale files SHALL include translations for the following sport values in both `en` and `de`: `cycling`, `kick_scooter`, `roller_skating`, `hockey`, `athletics`, `baseball`, `cricket`, `rugby`, `archery`, `golf`, `gymnastics`.

#### Scenario: Previously missing sport renders translated
- **WHEN** a pitch feature has `sport = "cycling"`
- **THEN** the list label displays `"Cycling track"` (EN) or `"Radweg"` (DE) instead of the raw value `"cycling"`
