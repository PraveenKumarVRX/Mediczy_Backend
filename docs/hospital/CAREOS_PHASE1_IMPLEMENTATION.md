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

## Database tables

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
