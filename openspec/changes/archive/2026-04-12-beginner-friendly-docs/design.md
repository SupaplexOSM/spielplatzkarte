## Context

The README is currently written for developers who already know what Docker, Vite, PostgREST, and OpenLayers are. It covers *what* to run but rarely explains *why* it works or *what to do when it doesn't*. There are no guides for the two most common contribution tasks: adding a device type and editing translations. The JS source files have minimal comments, making it hard for a newcomer to orient themselves.

The target reader is someone who: knows what a terminal is, can copy-paste a command, understands roughly what a web app is, but has never used Docker, never written JavaScript beyond small scripts, and doesn't know what PostgREST or osm2pgsql mean.

## Goals / Non-Goals

**Goals:**
- README becomes a self-contained onboarding document — someone with no prior context can get the stack running and understand what they're looking at
- Two concrete how-to guides (add device, add/edit translation) written as numbered tutorials with expected output
- Glossary that defines every technology term used in the README in one sentence
- Troubleshooting section that lists the 5–8 most common failure modes with their fix
- Data-flow section with an ASCII diagram showing the full request path
- Code comments in the three most important/complex JS files that explain the *why*, not just the *what*

**Non-Goals:**
- No runtime behaviour changes
- No new tooling, CI, or test infrastructure
- Not a full developer guide covering every JS module — only the three entry points identified in the proposal
- Not an API reference — PostgREST auto-generates that from the SQL schema

## Decisions

**Decision 1: Keep everything in README.md, not a `/docs` folder**
A single file is easier to find, easier to read on GitHub, and requires no extra tooling (no static site generator, no link maintenance). The README is already 312 lines and can comfortably grow to 600–800 with good section headers and a table of contents. If it grows beyond that, a `/docs` split can happen in a future change.

*Alternative considered:* MkDocs or Docusaurus site. Rejected — adds dependency overhead and GitHub Pages setup complexity. Out of scope for this change.

**Decision 2: Write for the terminal-comfortable but Docker-naive reader**
Every command block includes a plain-English sentence before it explaining what it does and why. Commands are never introduced without context. Error output is explained where it's expected.

**Decision 3: How-to guides as numbered steps with expected output**
Rather than prose descriptions, the device and translation guides use numbered steps with the exact file to open, the exact change to make, and what the user should see afterward. This mirrors the format of popular beginner tutorials (DigitalOcean, Netlify docs).

**Decision 4: Code comments explain the "why", skip the obvious**
Comments added to JS files do not restate what the code does (that's readable). They explain: why a module exists, what contract it maintains, what would break if you removed it, and where to look next. This keeps comments from becoming noise.

## Risks / Trade-offs

- [Risk] README gets too long and becomes hard to navigate → Mitigation: anchor-linked table of contents at the top; each major section has a clear header that GitHub renders as a jump link
- [Risk] Glossary definitions become outdated as dependencies change → Mitigation: keep definitions technology-neutral ("Vite is a build tool that turns your JS files into a single optimised file the browser can load fast") rather than version-specific
- [Risk] How-to guides fall out of sync with the code → Mitigation: guides reference the actual file names and data structures (e.g. `objDevices` in `objPlaygroundEquipment.js`) so the next maintainer notices immediately when a guide is stale

## Migration Plan

All changes are additive to `README.md` and add/modify comments in three JS files. No deployment, database, or API changes required. Rollback is a git revert.
