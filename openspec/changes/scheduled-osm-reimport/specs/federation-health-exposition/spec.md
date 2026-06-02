## ADDED Requirements

### Requirement: Hub carries `importing` through federation status JSON
The hub container's poll pipeline SHALL include the `importing` field from each backend's `get_meta` response in the corresponding entry of `/federation-status.json`. When the field is absent (older backend), the hub SHALL treat it as `false`.

#### Scenario: Status JSON reflects `importing: true` from a backend
- **WHEN** a backend returns `"importing": true` in its `get_meta` response during a poll
- **THEN** the corresponding entry in `/federation-status.json` includes `"importing": true`

#### Scenario: Status JSON defaults to `importing: false` for older backends
- **WHEN** a backend's `get_meta` response does not include the `importing` field
- **THEN** the corresponding entry in `/federation-status.json` includes `"importing": false`

### Requirement: Hub drawer shows "updating" badge when a backend is importing
The hub UI SHALL display a distinct visual indicator (e.g. an "updating" badge) next to a backend's entry in the instances drawer when its `/federation-status.json` entry has `importing: true`. When `importing` is absent or `false` the drawer renders normally.

#### Scenario: Drawer shows "updating" badge during an active import
- **WHEN** the hub's `/federation-status.json` entry for a backend has `"importing": true`
- **THEN** the corresponding row in the hub drawer displays an "updating" indicator alongside the backend name
- **AND** no error/down state is shown (the backend is healthy)

#### Scenario: Drawer shows no "updating" badge during normal operation
- **WHEN** the hub's `/federation-status.json` entry for a backend has `"importing": false` or the field is absent
- **THEN** no "updating" indicator is shown for that backend
