# CareOS Phase 1 — Technical Implementation

## API surface: `/api/v3/careos`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/workspace/:patientId` | Living Patient Workspace (full aggregate) |
| GET | `/timeline/:patientId` | Clinical timeline (searchable events) |
| POST | `/timeline/:patientId/events` | Append timeline event |
| GET/POST | `/teams/:patientId` | Dynamic care team |
| POST | `/teams/:patientId/auto-invite` | AI-suggested MDT invites |
| GET/PUT | `/pathway/:patientId` | Living treatment pathway |
| GET | `/coordinator/:patientId/alerts` | AI Chief Clinical Coordinator |
| POST | `/coordinator/:patientId/analyze` | Run coordinator analysis now |
| POST | `/mdt/start` | Start Instant Clinical Board |
| POST | `/mdt/:sessionId/join` | Join MDT session |
| POST | `/mdt/:sessionId/opinion` | Record specialist opinion |
| GET | `/mdt/:sessionId/consensus` | AI consensus summary |
| GET | `/playback/:patientId` | Clinical playback (48h) |
| GET | `/memory/similar/:patientId` | Hospital memory — similar cases |
| GET/POST | `/family/:patientId/updates` | Family-approved updates |
| POST | `/call/:patientId/token` | One-touch LiveKit clinical call |

## Ecosystem API: `/api/v3/careos/ecosystem` (Stage 2–3 scaffold)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/passport/:patientId` | Medical Passport (sync from workspace) |
| PUT | `/passport/:patientId` | Update passport fields |
| POST | `/passport/:patientId/share` | Consent-based share token |
| GET | `/passport/access/:token` | Access passport via share token |
| GET | `/identity/me` | Professional Care Identity + affiliations |
| POST | `/identity/affiliations` | Add org affiliation |
| GET | `/graph/:patientId` | Patient care subgraph |
| POST | `/graph/:patientId/seed` | Seed graph from clinical data |
| GET | `/federation/status` | Federation registration + trusts |
| GET | `/network/orgs` | List network organizations |
| POST | `/network/orgs` | Register org in CareOS network |
| POST | `/federation/trust` | Create trust agreement |
| POST | `/global-board/start` | Cross-border Clinical Board |
| POST | `/global-board/:sessionId/join` | Join global session |
| POST | `/translate` | Clinical message translation |

## Ecosystem database tables

See `careos-ecosystem.migration.js`: network orgs, federation trust, passports, shares, graph nodes/edges, global sessions.

## Phase 1 database tables

- `careos_care_teams` / `careos_team_members`
- `careos_clinical_events` (extends timeline model)
- `careos_tasks`
- `careos_treatment_pathways`
- `careos_mdt_sessions` / `careos_mdt_opinions`
- `careos_coordinator_alerts`
- `careos_hospital_cases` (memory)
- `careos_family_updates`

## Event types (Clinical Timeline)

`lab_trend` | `ai_insight` | `specialist_joined` | `nurse_observation` | `imaging_uploaded` | `ecg_uploaded` | `decision` | `task` | `mdt_opinion` | `device_alert` | `family_update`
