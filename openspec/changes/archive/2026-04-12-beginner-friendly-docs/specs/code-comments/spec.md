## ADDED Requirements

### Requirement: Entry-point file comments in main.js
`js/main.js` SHALL have a top-of-file block comment explaining what this file is, why it exists as the entry point, which modules it wires together, and what order things initialise in.

Each logical section within the file SHALL have a one-line comment explaining why that section exists (not what the code does — the code is readable; the comment answers "why is this here?").

#### Scenario: Newcomer opens main.js first
- **WHEN** a newcomer opens `js/main.js` to understand how the app starts
- **THEN** the top comment gives them a mental map of the module graph and they know where to look next for each concern

---

### Requirement: Panel state machine comments in selectPlayground.js
`js/selectPlayground.js` SHALL have a top-of-file block comment that explains:
- What "selecting a playground" means (URL hash, feature highlight, panel display)
- The three panel states on mobile (hidden / peek / open) and what triggers each
- The `showAttributes(true/false)` contract and what calling code is expected to do

Complex helper functions (drag handlers, panel state transitions) SHALL each have a short comment explaining the *why* (e.g. why `window.innerHeight` instead of `element.offsetHeight`).

#### Scenario: Newcomer wants to change what happens when a playground is clicked
- **WHEN** they open `selectPlayground.js` and read the top comment
- **THEN** they understand the panel state model and can find the right function to modify without reading the entire 1400-line file

---

### Requirement: Device catalogue comments in objPlaygroundEquipment.js
`js/objPlaygroundEquipment.js` SHALL have a top-of-file block comment explaining:
- The purpose of `objDevices` and `objFeatures`
- Every field in a device entry (`name_de`, `image`, `category`, `filterable`, `filter_attr`) with a one-line description of what it does and what happens if it's omitted
- Where the `image` filename comes from (Wikimedia Commons `File:` prefix) and the fallback behaviour

#### Scenario: Maintainer wants to add a new device
- **WHEN** they open `objPlaygroundEquipment.js` for the first time
- **THEN** the top comment alone gives them enough information to add a new entry correctly without reading the how-to guide
