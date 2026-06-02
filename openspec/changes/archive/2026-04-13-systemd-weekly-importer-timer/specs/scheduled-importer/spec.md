## ADDED Requirements

### Requirement: Service unit runs the importer via Docker Compose
The system SHALL provide a `deploy/spieli-import.service` systemd service unit that executes `docker compose run --rm importer` in the project directory, loading credentials from the `.env` file via `EnvironmentFile=`.

#### Scenario: Service unit executes the importer container
- **WHEN** the service unit is started (manually or by the timer)
- **THEN** `docker compose run --rm importer` is invoked in the configured `WorkingDirectory`
- **THEN** the importer container runs to completion and is removed afterwards

#### Scenario: Service unit picks up environment from .env
- **WHEN** the service unit starts
- **THEN** environment variables from `.env` (e.g. `OSM_RELATION_ID`, `PBF_URL`) are available to the Docker Compose invocation

### Requirement: Timer unit triggers the importer weekly
The system SHALL provide a `deploy/spieli-import.timer` systemd timer unit that activates the service unit once a week with `Persistent=true`.

#### Scenario: Timer fires on the weekly schedule
- **WHEN** the configured weekly calendar expression elapses
- **THEN** `spieli-import.service` is started automatically

#### Scenario: Missed run is caught on next boot
- **WHEN** the system was offline during a scheduled run
- **THEN** `spieli-import.service` is started once on the next boot due to `Persistent=true`

### Requirement: Unit files are documented for installation
The project documentation SHALL describe how to copy, configure, and enable the unit files so operators can set up automated imports without prior systemd expertise.

#### Scenario: Operator follows the documented install steps
- **WHEN** an operator follows the documented procedure (copy units, edit `WorkingDirectory` and `User=`, `systemctl enable --now`)
- **THEN** the timer is active and the importer runs automatically each week
