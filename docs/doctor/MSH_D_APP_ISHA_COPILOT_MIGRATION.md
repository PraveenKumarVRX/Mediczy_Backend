# msh_d_app — Dr. iSHA Copilot Migration (AI-PLATFORM-001)

Wire the existing Dr. iSHA assistant to the unified gateway `POST /api/doctor-copilot/chat`.

**Web doctor portal** is already on this gateway: route `/doctor/assistant`, service `client/src/services/doctorCopilot.ts`. Mobile steps below mirror the same API.

## Prerequisites

- Mediczy backend deployed with `POST /api/doctor-copilot/chat` (PR #13+)
- msh_d_app doctor token in `AsyncStorage` key `doctorToken` (or adjust `getToken`)

## 1. Copy the client package

From the Mediczy repo:

```bash
# Option A — automated (set path to your msh_d_app checkout)
MSH_D_APP_PATH=/path/to/msh_d_app node scripts/integrate-msh-d-app-copilot.mjs

# Option B — manual
cp -R shared/doctor-mobile-api /path/to/msh_d_app/app/api/mediczy/doctor-mobile-api
```

Expected layout:

```
msh_d_app/
  app/
    api/mediczy/doctor-mobile-api/
      doctorCopilot.client.js
      ishaCopilot.service.js
      useDoctorIshaCopilot.js
      screenPaths.js
    Utils/
      api.js          ← update Isha module here
    Screens/
      ...Isha...      ← existing Dr. iSHA screen
```

## 2. Initialize at login

After successful `POST /api/doctors/login`, call once:

```javascript
import { initIshaCopilot } from '../api/mediczy/doctor-mobile-api/ishaCopilot.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from 'react-native-config';

initIshaCopilot({
  baseUrl: Config.API_BASE_URL || 'https://app.mediqzy.com/api',
  getToken: () => AsyncStorage.getItem('doctorToken'),
  timeoutMs: 30000,
});
```

## 3. Replace legacy agent calls

### Before (legacy)

```javascript
// app/Utils/api.js
export const Isha = {
  agent: (data) => api.post('/voice-assistant/agent', {
    text: data.text,
    context: data.context,
    history: data.history,
  }),
  stt: (form) => api.post('/voice-assistant/stt', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
  briefing: () => api.get('/voice-assistant/briefing'),
};
```

```javascript
// Isha screen
const { data } = await Isha.agent({ text, context: { currentScreen: 'dashboard' }, history });
const reply = data.response || data.speak;
```

### After (copilot gateway)

**Minimal change** — use the drop-in snippet:

```javascript
// Replace Isha export with shared/doctor-mobile-api/msh-d-app/api.isha.snippet.js
import { Isha, ensureIshaCopilotInitialized } from './api.isha'; // your re-export

ensureIshaCopilotInitialized();
const { data } = await Isha.chat({ message: text, context, history });
```

`Isha.chat()` returns the **same response shape** as `/voice-assistant/agent` so existing UI/action handling keeps working.

**Recommended** — use the hook on the iSHA screen:

```javascript
import useDoctorIshaCopilot from '../api/mediczy/doctor-mobile-api/useDoctorIshaCopilot';

const { sendMessage, isProcessing, pendingAction, confirmPendingAction } = useDoctorIshaCopilot({
  currentScreen: route.name,
  currentPatient: selectedPatient,
  onNavigate: (routeName, params) => navigation.navigate(routeName, params),
  onSpeak: (text, onDone) => Tts.speak(text, { onDone }),
  onError: (msg) => Alert.alert('iSHA', msg),
});

// Text send
await sendMessage(inputText);

// Voice: STT then chat
const form = new FormData();
form.append('audio', { uri, type: 'audio/m4a', name: 'audio.m4a' });
const { text: transcript } = await transcribeAudio(form);
await sendMessage(transcript);
```

## 4. Context fields (important)

Always pass:

| Field | When |
|---|---|
| `context.currentScreen` | Every request — e.g. `Dashboard`, `PatientDetails`, `SetTimeSlots` |
| `context.currentPatient` | On Patient Details — `{ id, name }` for chart-aware clinical answers |
| `history` | Last 10–15 turns `{ role, text }` for follow-ups |

Clinical questions (e.g. "metformin side effects") auto-route to medical AI — no separate `/medical-ai/consult` call needed.

## 5. Action handling (unchanged)

The gateway returns the same `action` / `parameters` / `requiresConfirmation` fields:

| Action | Mobile behavior |
|---|---|
| `list_appointments` | Render `data` array (live DB rows) |
| `navigate_to` | `navigation.navigate(ISHA_SCREEN_ROUTES[screen])` |
| `search_patient` | Navigate to PatientsList with search query |
| `requiresConfirmation` | Show confirm dialog before destructive actions |

Route map: `shared/doctor-mobile-api/screenPaths.js` — adjust names to match your navigator.

## 6. Verify

```bash
# In Mediczy server repo
npm run test:doctor-ai-contracts
npm run test:clinical-golden-regression
```

On device:

1. "Show today's appointments" → live appointment list
2. "Metformin side effects" → clinical answer (`path: clinical` in response)
3. On Patient Details with patient context → patient-aware reply
4. Check `traceId` in logs for support

## 7. Rollback

Legacy endpoint remains available. Revert `Isha.agent` to `api.post('/voice-assistant/agent', ...)` if needed — no backend change required.

---

See also: [DOCTOR_APP_API_INTEGRATION_GUIDE.md](./DOCTOR_APP_API_INTEGRATION_GUIDE.md) §14.10 · [shared/doctor-mobile-api/README.md](../../shared/doctor-mobile-api/README.md)
