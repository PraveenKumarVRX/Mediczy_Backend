# TTS Timeout Fix - Complete Implementation

## Problem Statement

The application was experiencing **TTS (Text-to-Speech) timeouts** with the error:

```
timeout of 10000ms exceeded
AxiosError: ECONNABORTED
```

This occurred in the Emergency page and other components that use ElevenLabs API for speech synthesis.

## Root Causes

1. **No explicit timeout configuration** - Fetch requests lacked AbortController with timeout
2. **ElevenLabs API latency** - API calls can exceed 10 seconds for larger text
3. **No graceful fallback** - Timeouts triggered errors instead of failing over to browser TTS
4. **Missing error handling** - AbortError exceptions weren't caught specifically

## Solution Implemented

### 1. Server-Side Changes (`/server/routes/tts.route.js`)

#### TTS Speak Endpoint (`POST /api/tts/speak`)

```javascript
// Added AbortController with 30s timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
  response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}`,
    {
      // ... headers and body ...
      signal: controller.signal, // Pass signal for timeout support
    },
  );
} finally {
  clearTimeout(timeoutId); // Always cleanup timeout
}

// Handle AbortError specifically
if (error.name === "AbortError") {
  return res.status(504).json({
    success: false,
    message: "TTS request timed out - using fallback",
    error: "timeout",
    fallback: true,
  });
}
```

**Timeout**: 30 seconds (sufficient for ElevenLabs API)
**Fallback Signal**: Client receives `fallback: true` to trigger browser TTS

#### Voices Endpoint (`GET /api/tts/voices`)

```javascript
// Added timeout for voice list fetching
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

try {
  response = await fetch("https://api.elevenlabs.io/v1/voices", {
    signal: controller.signal,
  });
} finally {
  clearTimeout(timeoutId);
}
```

**Timeout**: 10 seconds (voice list is smaller)

### 2. Client-Side Changes

#### Emergency.tsx (`/client/src/pages/Emergency.tsx`)

- Added AbortController with **25-second timeout** to fetch request
- Implemented try/finally for guaranteed cleanup
- Already has fallback to browser speech synthesis

#### AiDoctor.tsx (`/client/src/pages/AiDoctor.tsx`)

- Added AbortController with **25-second timeout** to axios POST request
- Used try/finally pattern with signal abort
- Falls back to `fallbackBrowserTTS()` on error

#### VoiceNavigation.tsx (`/client/src/components/VoiceNavigation.tsx`)

- Added AbortController with **25-second timeout** to axios TTS call
- Falls back to `browserSpeak()` on timeout
- Used try/finally for proper cleanup

**Client Timeout**: 25 seconds (shorter than server to detect timeouts faster)

## Timeout Strategy

```
Timeline:
0ms  ────────────────────────────────────────────────────────
      Client sends request
      (AbortController: 25s timeout)

25s  ────────────────────────────────────────────────────────
      Client aborts if no response
      Fallback to browser TTS triggered

30s  ────────────────────────────────────────────────────────
      Server aborts Eleven Labs fetch
      Sends fallback response (if still processing)
```

## Fallback Behavior Flow

```
┌─────────────────────┐
│  TTS Request Sent   │
└──────────┬──────────┘
           │
           ├──── Success (< 25s) ──→ Play ElevenLabs Audio
           │
           ├──── Timeout (25s) ──→ Fallback to Browser TTS
           │
           └──── Error ──────────→ Browser Speech Synthesis
                  (handles audio errors too)
```

## Files Modified

| File                                         | Changes                                                   | Timeout   |
| -------------------------------------------- | --------------------------------------------------------- | --------- |
| `/server/routes/tts.route.js`                | Added AbortController to `/speak` and `/voices` endpoints | 30s / 10s |
| `/client/src/pages/Emergency.tsx`            | Added timeout handler to fetch call                       | 25s       |
| `/client/src/pages/AiDoctor.tsx`             | Added timeout handler to axios POST                       | 25s       |
| `/client/src/components/VoiceNavigation.tsx` | Added timeout handler to axios POST                       | 25s       |

## Testing

### 1. Server Endpoint

```bash
# Check TTS service status
curl http://localhost:8888/api/tts/status

# Expected response:
{
  "success": true,
  "configured": true,
  "defaultVoiceId": "pjcYQlDFKMbcOUp6F5GD",
  "provider": "elevenlabs"
}
```

### 2. Manual TTS Test

```bash
# Test TTS with timeout handling
curl -X POST http://localhost:8888/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Test message"}'

# Should return audio data or fallback signal
```

### 3. Browser Testing

1. Navigate to Emergency page
2. Trigger voice response (any voice feature)
3. Monitor browser console for:
   - Successful audio playback, OR
   - "TTS error" warning + fallback to browser TTS

## Benefits

✅ **Prevents Hanging Requests** - AbortController stops requests after timeout
✅ **Graceful Degradation** - Falls back to browser TTS instead of failure
✅ **Better User Experience** - No silent failures or unclear errors
✅ **Server Resources** - Releases connections faster on timeout
✅ **Fallback is Automatic** - User hears speech regardless of ElevenLabs availability
✅ **Proper Cleanup** - try/finally ensures timeouts are cleared

## Error Handling

| Scenario                  | Client Behavior           | Server Behavior               |
| ------------------------- | ------------------------- | ----------------------------- |
| ElevenLabs Success        | Plays audio               | Returns audio stream          |
| ElevenLabs Timeout        | Fallback to browser TTS   | Returns 504 + fallback flag   |
| ElevenLabs API Error      | Fallback to browser TTS   | Returns error + fallback flag |
| Network Error             | Fallback to browser TTS   | Returns error + fallback flag |
| Browser TTS Not Available | Silent failure (graceful) | N/A                           |

## Performance Impact

- **No negative impact** - Timeouts only activate on slow/failed requests
- **Faster failure detection** - 25s client timeout vs indefinite hanging
- **Memory cleanup** - Proper timeout clearance prevents leaks
- **Better UX** - Users don't wait for hung requests

## Deployment

Commit: `6ab03b4` - "Fix TTS timeout errors with AbortController and fallback handling"

```bash
git add -A
git commit -m "Fix TTS timeout errors..."
git push origin main
npm run build
pm2 restart mediczy-server --update-env
```

## Future Improvements

1. **Configurable Timeouts** - Move timeout values to environment variables
2. **Retry Logic** - Implement exponential backoff for transient failures
3. **Voice Cache** - Cache voice list to reduce API calls
4. **Circuit Breaker** - Disable ElevenLabs if repeatedly failing
5. **Metrics** - Track TTS success/fallback rates
6. **User Notification** - Explicitly inform users when using fallback TTS

## References

- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN: Fetch Timeout Pattern](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal#examples)
- [ElevenLabs API Docs](https://elevenlabs.io/docs/api-reference)
- [Browser Speech Synthesis API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
