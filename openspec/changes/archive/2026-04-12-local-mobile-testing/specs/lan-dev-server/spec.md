## ADDED Requirements

### Requirement: Vite dev server binds to all network interfaces
The Vite dev server SHALL bind to `0.0.0.0` (all interfaces) so that devices on the same local network can reach it by the host machine's LAN IP address.

#### Scenario: Dev server reachable from phone on same WiFi
- **WHEN** developer runs `make dev` (or `npm start`)
- **THEN** the server binds to `0.0.0.0:5173` and is reachable at `http://<host-lan-ip>:5173` from another device on the same network

#### Scenario: LAN URL printed on startup
- **WHEN** the Vite dev server starts
- **THEN** the terminal output includes both the `localhost` URL and the `Network:` LAN URL so the developer can copy it to the phone

### Requirement: `make lan-url` prints local access addresses
A `make lan-url` target SHALL print the host machine's primary LAN IP and the full URLs for both the Vite dev server and the Docker Compose stack, so the developer always has a ready-to-use address regardless of which stack is running.

#### Scenario: Developer runs `make lan-url`
- **WHEN** developer runs `make lan-url` in the project directory
- **THEN** the terminal prints the LAN IP and both access URLs (Vite on port 5173, Docker stack on port 8080 or `$APP_PORT`)

### Requirement: LAN testing documented in CLAUDE.md
CLAUDE.md SHALL include a short section explaining how to access the running app from a phone on the same WiFi network, covering both the Vite dev server and Docker Compose stack paths.

#### Scenario: Developer follows documentation
- **WHEN** developer reads the LAN testing section in CLAUDE.md
- **THEN** they can find their LAN IP, open the correct URL on their phone, and verify the app loads without additional configuration
