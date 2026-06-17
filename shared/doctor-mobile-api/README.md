# Doctor Mobile API — Copilot Client

Portable client for the **msh_d_app** React Native doctor app (AI-PLATFORM-001).

## Install in msh_d_app

```bash
# From Mediczy repo root
MSH_D_APP_PATH=/path/to/msh_d_app node scripts/integrate-msh-d-app-copilot.mjs
```

Or copy manually:

```
msh_d_app/app/api/mediczy/doctor-mobile-api/
```

Full migration guide: [docs/doctor/MSH_D_APP_ISHA_COPILOT_MIGRATION.md](../../docs/doctor/MSH_D_APP_ISHA_COPILOT_MIGRATION.md)

## Quick start

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDoctorCopilotClient } from './api/mediczy/doctor-mobile-api';

const copilot = createDoctorCopilotClient({
  baseUrl: 'https://app.mediqzy.com/api',
  getToken: () => AsyncStorage.getItem('doctorToken'),
  timeoutMs: 30000,
});

// Text chat (replaces POST /voice-assistant/agent and /medical-ai/consult)
const result = await copilot.chat({
  message: 'Show my appointments for today',
  context: {
    currentScreen: 'dashboard',
    currentPatient: selectedPatient
      ? { id: selectedPatient.id, name: selectedPatient.name }
      : null,
  },
  history: priorTurns,
  sessionId: sessionId,
});

const spoken = result.response || result.speak;
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `copilot.chat()` | `POST /api/doctor-copilot/chat` | Unified doctor AI (agent + clinical) |
| `copilot.getBriefing()` | `GET /api/voice-assistant/briefing` | Morning briefing |
| `copilot.speechToText()` | `POST /api/voice-assistant/stt` | Voice → text |
| `copilot.health()` | `GET /api/doctor-copilot/health` | Gateway health |

## Files

| File | Purpose |
|---|---|
| `doctorCopilot.client.js` | Low-level fetch client (JS) |
| `doctorCopilot.client.ts` | Low-level fetch client (TS) |
| `ishaCopilot.service.js` | `sendIshaMessage`, `parseIshaAction`, init singleton |
| `useDoctorIshaCopilot.js` | React hook for iSHA screen |
| `screenPaths.js` | `navigate_to` screen → React Navigation route map |
| `msh-d-app/api.isha.snippet.js` | Drop-in `Utils/api.js` Isha module replacement |

## Migration from legacy endpoints

| Before | After |
|---|---|
| `POST /api/voice-assistant/agent` | `copilot.chat({ message, context, history })` |
| `POST /api/medical-ai/consult` (doctor) | Same — gateway routes clinical queries automatically |

Always pass `context.currentPatient` when on Patient Details screen for chart-aware answers.

## Response fields

- `response` / `speak` — display or TTS text
- `action` / `parameters` — client-side navigation or booking execution
- `requiresConfirmation` — show confirm UI before executing destructive actions
- `traceId` — log for support / governance

See `docs/doctor/DOCTOR_APP_API_INTEGRATION_GUIDE.md` §14.10 for full API contract.
