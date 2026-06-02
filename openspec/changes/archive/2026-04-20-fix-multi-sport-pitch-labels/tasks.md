## 1. Create GitHub issue and branch

- [x] 1.1 Create GitHub issue referencing #198 (multi-sport pitch label bug)
- [x] 1.2 Create branch `fix/198-multi-sport-pitch-labels`

## 2. Fix label rendering in EquipmentList

- [x] 2.1 In `app/src/components/EquipmentList.svelte`, replace the single-key sport lookup with split-translate-join logic
- [x] 2.2 Verify single-sport pitches still render correctly (no regression)
- [x] 2.3 Verify multi-sport pitches (e.g. `cycling;bmx;skateboard`) render as joined translated labels

## 3. Extend locale files

- [x] 3.1 Add missing sport keys to `locales/en.json` under `equipment.pitches`: `cycling`, `kick_scooter`, `roller_skating`, `hockey`, `athletics`, `baseball`, `cricket`, `rugby`, `archery`, `golf`, `gymnastics`
- [x] 3.2 Add corresponding translations to `locales/de.json`

## 4. Add contributing guide

- [x] 4.1 Create `docs/contributing/add-sport-type.md` following the structure of `docs/contributing/add-device.md`
- [x] 4.2 Guide must cover: finding the OSM tag, adding both locale keys, local verification with `make dev`, and commit/PR steps
- [x] 4.3 Guide must link to OSM wiki pages for `leisure=pitch` and `Key:sport`

## 5. Build and verify

- [x] 5.1 Run `make docker-build` and verify multi-sport pitch displays correctly in the equipment list
- [x] 5.2 Check that the completeness legend and other bottom-left UI are unaffected

## 6. Commit and open PR

- [x] 6.1 Commit changes with message `fix(ui): render multi-value sport tags correctly in pitch list (#198)`
- [x] 6.2 Push branch and open PR targeting `main`
