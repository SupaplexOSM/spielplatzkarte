## 1. Create deploy directory and service unit

- [x] 1.1 Create `deploy/` directory at the project root
- [x] 1.2 Create `deploy/spieli-import.service` with `ExecStart=docker compose run --rm importer`, `WorkingDirectory=` placeholder, `EnvironmentFile=` pointing to `.env`, and a commented-out `User=` placeholder
- [x] 1.3 Verify the service unit passes `systemd-analyze verify` (or manual review for correctness)

## 2. Create timer unit

- [x] 2.1 Create `deploy/spieli-import.timer` with `OnCalendar=weekly`, `Persistent=true`, and `[Install] WantedBy=timers.target`
- [x] 2.2 Ensure the timer unit references `spieli-import.service` via `Unit=` (or relies on the matching name convention)

## 3. Document installation

- [x] 3.1 Add a "Automated weekly import" section to `CLAUDE.md` documenting: copy units to `/etc/systemd/system/`, edit `WorkingDirectory=` and `User=`, run `systemctl daemon-reload && systemctl enable --now spieli-import.timer`
- [x] 3.2 Document the rollback/disable procedure in the same section
- [x] 3.3 Add a prerequisite note: service user must be in the `docker` group

## 4. Verification

- [x] 4.1 Confirm `deploy/spieli-import.service` and `deploy/spieli-import.timer` exist in the repo
- [x] 4.2 Confirm documentation covers all acceptance criteria from issue #60
