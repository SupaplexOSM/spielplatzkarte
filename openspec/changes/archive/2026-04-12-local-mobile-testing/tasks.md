## 1. Vite dev server — bind to all interfaces

- [x] 1.1 Add `server: { host: true }` to `vite.config.js` so Vite binds to `0.0.0.0` and prints the LAN URL on startup

## 2. Makefile — LAN URL helper

- [x] 2.1 Add `make lan-url` target that prints the host LAN IP and the full URLs for the Vite dev server (port 5173) and the Docker stack (port `$APP_PORT` / 8080)
- [x] 2.2 Add `lan-url` to the `.PHONY` declaration and the `help` output

## 3. Documentation

- [x] 3.1 Add a "Testing on mobile / LAN access" section to `CLAUDE.md` explaining how to find the LAN IP (`make lan-url`), which URL to open on the phone, and a note about the Docker stack already being reachable without extra config
- [x] 3.2 Add a "Testing on a phone / LAN access" subsection to `README.md` under "Local development"
