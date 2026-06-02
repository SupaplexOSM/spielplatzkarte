## ADDED Requirements

### Requirement: RC image published on main push
The CI pipeline SHALL publish container images tagged `:rc` for both the app image and the importer image on every push to the `main` branch (i.e. every merged PR).

#### Scenario: App image tagged rc on main push
- **WHEN** a commit is pushed to `main`
- **THEN** the app image `ghcr.io/<repo>` is pushed with the `:rc` tag

#### Scenario: Importer image tagged rc on main push
- **WHEN** a commit is pushed to `main`
- **THEN** the importer image `ghcr.io/<repo>-importer` is pushed with the `:rc` tag

#### Scenario: RC tag not published on version tag push
- **WHEN** a `v*` tag is pushed
- **THEN** neither the app nor the importer image is tagged `:rc`

### Requirement: latest tag reserved for version releases
The CI pipeline SHALL NOT publish the `:latest` tag on pushes to `main`. The `:latest` tag SHALL only be published when a version tag (`v*`) is pushed.

#### Scenario: Latest not overwritten on main push
- **WHEN** a commit is pushed to `main`
- **THEN** neither image is pushed with the `:latest` tag

#### Scenario: Short-SHA tag still published
- **WHEN** a commit is pushed to `main`
- **THEN** both images are still pushed with the short commit SHA tag for traceability
