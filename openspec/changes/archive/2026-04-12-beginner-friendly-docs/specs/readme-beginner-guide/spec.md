## ADDED Requirements

### Requirement: Table of contents
The README SHALL have an anchor-linked table of contents at the top listing all major sections so a reader can jump directly to what they need.

#### Scenario: Reader finds the troubleshooting section fast
- **WHEN** a user opens the README on GitHub
- **THEN** they can click a "Troubleshooting" link in the table of contents and land on that section without scrolling

---

### Requirement: Glossary section
The README SHALL include a Glossary section that defines every technology term used in the document in one plain-English sentence, with no assumed prior knowledge.

Terms that MUST be defined: Docker, Docker Compose, Vite, Node.js, PostgREST, PostgreSQL, PostGIS, osm2pgsql, OpenLayers, i18next, Overpass API, OpenStreetMap (OSM), nginx, PBF file, OSM relation ID.

#### Scenario: Reader unfamiliar with Docker reads the glossary
- **WHEN** a reader encounters "Docker" in the README
- **THEN** they can find a one-sentence plain-English explanation in the Glossary without leaving the page

---

### Requirement: Data-flow section with diagram
The README SHALL include a "How the data flows" section containing an ASCII diagram and a short narrative (3–5 sentences) that explains the full request path from the browser to the database and back, and separately explains how Overpass is used during local development without a database.

#### Scenario: Reader understands why PostgREST exists
- **WHEN** a reader follows the data-flow narrative
- **THEN** they understand that PostgREST turns the database into an HTTP API without requiring custom server code

---

### Requirement: Troubleshooting section
The README SHALL include a Troubleshooting section listing at least the following failure modes, each with its symptom and exact fix:

1. Port 8080 already in use
2. `make import` exits immediately or fails with a database error
3. Map loads but shows no playgrounds (blank map, no markers)
4. Geolocation button does nothing on mobile
5. Dev server starts but changes don't appear (cache issue)
6. `make lan-url` prints "Could not detect LAN IP"

#### Scenario: Reader's map is blank
- **WHEN** a reader follows the "Map loads but shows no playgrounds" troubleshooting entry
- **THEN** they find the likely cause (import not run, wrong relation ID, or Overpass timeout) and the command to verify or fix it

---

### Requirement: Contributing section with PR walkthrough
The README SHALL include a Contributing section with a step-by-step numbered tutorial covering: creating a branch, making a change, testing locally, pushing, and opening a PR — using concrete commands and referencing the project's naming conventions.

#### Scenario: First-time contributor creates a PR
- **WHEN** a reader follows the Contributing section step by step
- **THEN** they produce a correctly named branch, a commit with a conventional commit message, and a PR on GitHub without needing external documentation
