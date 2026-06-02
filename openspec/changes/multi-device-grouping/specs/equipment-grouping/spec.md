## ADDED Requirements

### Requirement: Structure polygons group contained devices
When the equipment feature list contains one or more `playground=structure` polygon ways, each such polygon SHALL act as a group container. Any other device feature whose representative point falls inside the structure polygon's geometry SHALL be treated as a component of that structure, not as a standalone device.

#### Scenario: Device inside structure polygon is grouped
- **WHEN** a `playground=structure` polygon and a `playground=climbing_slope` node are both present in the equipment feature list
- **AND** the node's coordinates fall within the polygon's geometry
- **THEN** the climbing slope is a component of the structure and does not appear as a standalone device

#### Scenario: Device outside all structure polygons remains standalone
- **WHEN** a `playground=swing` node is present alongside a `playground=structure` polygon
- **AND** the swing node's coordinates fall outside the polygon
- **THEN** the swing appears as a standalone device in the flat list

#### Scenario: No structure polygons leaves behavior unchanged
- **WHEN** the equipment feature list contains no `playground=structure` polygon features
- **THEN** all devices are rendered in the flat list exactly as before this change

### Requirement: Equipment list renders a structure as one expandable entry
A `playground=structure` group SHALL be rendered as a single collapsible list item. When expanded, it SHALL list its component devices beneath it. Components SHALL NOT appear as independent rows in the equipment list.

#### Scenario: Structure entry is collapsed by default
- **WHEN** a structure group is rendered in the equipment list
- **THEN** only the structure name is visible; components are hidden

#### Scenario: Expanding reveals components
- **WHEN** the user clicks the structure entry
- **THEN** all component device names are shown as sub-rows beneath the structure

#### Scenario: Structure with no components still renders
- **WHEN** a `playground=structure` polygon has no other devices contained within it
- **THEN** the structure appears as a standalone device entry (no grouping UI)

### Requirement: Structure summary count
A structure entry SHALL show the count of its components in a badge or suffix when collapsed, so users know something is grouped without expanding.

#### Scenario: Component count shown while collapsed
- **WHEN** a structure has 3 components
- **THEN** the collapsed entry displays something like "Spielstruktur · 3 Teile" or "(3)"

### Requirement: Map layer suppresses component dots within a structure
Device features that belong to a structure group SHALL NOT render as individual dots on the equipment map layer. The structure polygon itself SHALL render normally.

#### Scenario: Component dot is hidden
- **WHEN** a device is a component of a structure group
- **THEN** no dot or shape appears for that device on the equipment layer

#### Scenario: Structure polygon is visible
- **WHEN** a structure group exists
- **THEN** the structure's polygon (or its centroid dot) appears on the equipment layer

### Requirement: Structure photo viewer aggregates component photos
When a structure entry is expanded, the photo viewer SHALL display a combined Panoramax photo strip containing photos from all components that have a `panoramax` tag. If the structure itself has a `panoramax` tag, that photo SHALL appear first.

#### Scenario: Photos from multiple components appear in one strip
- **WHEN** a structure has components A (with photo) and B (with photo)
- **THEN** both photos appear in one `PanoramaxViewer` thumbnail strip on the structure entry

#### Scenario: Component with no photo is silently skipped
- **WHEN** a component has no `panoramax` tag
- **THEN** no empty slot appears; the strip shows only photos from components that have one

#### Scenario: No photos at all shows empty state
- **WHEN** neither the structure nor any component has a `panoramax` tag
- **THEN** the photo viewer shows the standard "no photos" empty state
