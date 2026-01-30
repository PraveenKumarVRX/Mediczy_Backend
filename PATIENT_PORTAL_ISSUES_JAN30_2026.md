# Patient Portal Issues & Fixes

**Date:** January 30, 2026  
**Status:** 🔴 6 CRITICAL ISSUES FOUND

---

## Patient Dashboard Issues Summary

| #   | Issue                                                     | Component              | Root Cause                                                               | Fix                                    |
| --- | --------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| 1   | **Emergency Call** - Cannot connect                       | Emergency.tsx          | Socket.IO event name mismatch or doctor list fetch error                 | Check connectToTriageDoctor() function |
| 2   | **My Appointments** - Click doctor → redirects to booking | MyBookings.tsx         | Navigation handler redirects to find/book instead of appointment details | Fix onClick handler for doctor rows    |
| 3   | **Video Consultation** - Blank screen + no connection     | VideoConsultation.tsx  | LiveKit connection not initializing OR room ID not passed                | Check LiveKit setup and URL generation |
| 4   | **Notifications** - Unread/Read filter not working        | NotificationCenter.tsx | No read/unread filtering implemented in dropdown                         | Add filter state and logic             |
| 5   | **Reports** - Error loading                               | Reposts.tsx            | API endpoint not returning data OR response parsing fails                | Check /ai/analyze-image endpoint       |
| 6   | **Chat With Doctor** - No doctors list                    | VideoChatdoctor.tsx    | Doctor fetch endpoint returns empty OR data parsing error                | Fix availableUsers fetch and display   |

---

## DETAILED ISSUES & FIXES

### Issue #1: Emergency Call - Cannot Connect

**File:** `/home/ubuntu/Mediczy/client/src/pages/Emergency.tsx`

**Problem:**

```tsx
const connectToTriageDoctor = async (doctorId?: string, useHC: boolean = false) => {
  setConnectingToDoctor(true);
  try {
    const response = await api.post('/medical-ai/instant-triage-call', {
      doctorId,
      symptoms,
      urgencyLevel: currentUrgency || 'URGENT',
      triageId: `triage_${Date.now()}`,
      paymentMethod: useHC ? 'hc' : undefined
    });

    if (response.data.success) {
      // But Socket.IO listener might not be connected!
      setVideoCallInfo(response.data.videoCall); // Line ~1005
    }
  }
}
```

**Root Cause:**

- Socket.IO might not be connected when trying to receive `triage-call-accepted` event
- Error handling doesn't distinguish between "no doctors available" vs "connection error"

**Fix Needed:**

- Verify socket is connected before sending request
- Add better error messages

---

### Issue #2: My Appointments - Doctor Click Redirects Wrong

**File:** `/home/ubuntu/Mediczy/client/src/pages/MyBookings.tsx`

**Problem:**
When clicking on a doctor name in appointments list, it navigates to doctor booking page instead of showing appointment details.

**Location:** Lines showing doctor row click handlers

**Root Cause:**
Likely a `<Link>` or `onClick` handler that navigates to doctor booking instead of appointment details view.

**Fix Needed:**
Change onClick from `/doctors` route to appointment details modal/page

---

### Issue #3: Video Consultation - Blank Screen + No Connection

**File:** `/home/ubuntu/Mediczy/client/src/pages/VideoConsultation.tsx`

**Problem:**

```tsx
// LiveKit connection state
interface LiveKitConnection {
  serverUrl: string;
  token: string;
  roomName: string;
}

const [liveKitConnection, setLiveKitConnection] =
  useState<LiveKitConnection | null>(null);
// ^^^ Set to null but never populated in useEffect!
```

**Root Cause:**

- `liveKitConnection` is initialized to null and never set
- LiveKit component isn't receiving connection parameters
- Video iframe has no room URL

**Fix Needed:**

- Populate `liveKitConnection` with proper serverUrl, token, and roomName
- Call LiveKit API to get token: `GET /api/video/livekit/token`

---

### Issue #4: Notifications - Filter Not Working

**File:** `/home/ubuntu/Mediczy/client/src/components/NotificationCenter.tsx`

**Problem:**
Component doesn't have unread/read filter state. It shows all notifications regardless of read status.

**Code Location:** Lines 110-140 - notification mapping

**Root Cause:**
No filter logic implemented:

```tsx
// CURRENT CODE (SHOWS ALL):
{notifications.map((notification) => (
  // Shows ALL notifications, no read/unread filtering
))}

// NEEDED CODE:
const filteredNotifications = filterStatus === 'unread'
  ? notifications.filter(n => !n.read)
  : filterStatus === 'read'
  ? notifications.filter(n => n.read)
  : notifications;
```

**Fix Needed:**

- Add filter state: `[filterStatus, setFilterStatus] = useState('all')`
- Add filter tabs/buttons in header
- Filter notifications before mapping

---

### Issue #5: Reports - Error Loading

**File:** `/home/ubuntu/Mediczy/client/src/pages/Reposts.tsx` (note: typo in filename)

**Problem:**

```tsx
const analyzeImage = async () => {
  // ...
  const response = await api.post("/ai/analyze-image", {
    image: base64Image,
    language,
  });
  const description = cleanMarkdown(response.data?.description || "");
  // ^^^ endpoint might return data in different format
};
```

**Root Cause:**

- API endpoint returns data in unexpected format
- Response validation is weak
- No error handling for missing description field

**Fix Needed:**

- Check actual API response structure
- Add proper error handling
- Validate response before accessing properties

---

### Issue #6: Chat With Doctor - No Doctors List

**File:** `/home/ubuntu/Mediczy/client/src/pages/chat/VideoChatdoctor.tsx`

**Problem:**

```tsx
const { data: availableUsers = [] } = useQuery<Recipient[]>({
  queryKey: [recipientQueryKey, userType],
  queryFn: async () => {
    const { data } = await api.get(recipientEndpoint);
    return normalizeParticipants(data); // ^^^ normalizeParticipants might fail
  },
  enabled: !!currentId,
});

// Line 155+: availableUsers might be empty
```

**Root Cause:**

- `normalizeParticipants()` function might be stripping valid doctors if data format is different
- Endpoint returns data in format that doesn't match expectations
- No error logging for data format mismatches

**Fix Needed:**

- Add console.log to see actual data structure
- Improve `normalizeParticipants()` to handle more formats
- Add fallback for when doctors list is empty

---

## Testing Commands

```bash
# Test Emergency Call API
curl -X POST http://localhost:8000/api/medical-ai/instant-triage-call \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"symptoms": "chest pain"}'

# Test Chat Doctors List API
curl http://localhost:8000/api/doctors/available \
  -H "Authorization: Bearer <USER_TOKEN>"

# Test Reports API
curl -X POST http://localhost:8000/api/ai/analyze-image \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"image": "base64data...", "language": "en"}'

# Test Video Consultation Token
curl http://localhost:8000/api/video/livekit/token \
  -H "Authorization: Bearer <USER_TOKEN>"
```

---

## Implementation Priority

1. ✅ **HIGH:** Issue #3 (Video blank screen) - Users can't consult
2. ✅ **HIGH:** Issue #1 (Emergency call) - Critical for emergency users
3. ✅ **MEDIUM:** Issue #6 (Chat doctors list) - Core feature broken
4. ✅ **MEDIUM:** Issue #2 (Appointment navigation) - UX issue
5. ✅ **LOW:** Issue #4 (Notification filter) - Nice to have
6. ✅ **LOW:** Issue #5 (Reports error) - Less critical

---

## Next Steps

1. Debug each endpoint to see actual response format
2. Fix data parsing in components
3. Add proper error logging
4. Test all flows end-to-end
