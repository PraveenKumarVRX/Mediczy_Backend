# LiveKit Video Integration

This guide shows how to consume the LiveKit tokens returned by the Mediczy backend for web and React Native clients.

## Backend Response

When LiveKit is the active provider, these endpoints return a `video.livekit` payload and a `video.joinUrl`:

- `GET /api/consultation/video/join/:appointmentId`
- `POST /api/doctors/appointments/:appointmentId/initiate-call`

Example payload:

```json
{
  "video": {
    "meetingId": "MEDCALL-123-ABCD",
    "meetingLink": "https://meet.your-domain.com/rooms/MEDCALL-123-ABCD",
    "joinUrl": "https://meet.your-domain.com/rooms/MEDCALL-123-ABCD?access_token=...",
    "livekit": {
      "serverUrl": "wss://livekit.your-domain.com",
      "token": "...",
      "roomName": "MEDCALL-123-ABCD",
      "meetUrl": "https://meet.your-domain.com/rooms/MEDCALL-123-ABCD",
      "joinUrl": "https://meet.your-domain.com/rooms/MEDCALL-123-ABCD?access_token=..."
    }
  }
}
```

## Web (LiveKit Meet)

Use the `video.joinUrl` directly in a new window or an iframe. This is the fastest path and requires no custom UI.

```ts
const response = await api.get(`/consultation/video/join/${appointmentId}`);
const joinUrl = response.data?.video?.joinUrl;
if (joinUrl) {
  window.open(joinUrl, '_blank', 'width=1280,height=720');
}
```

## React Native (SDK)

Use the `video.livekit.serverUrl` and `video.livekit.token` to connect with the LiveKit React Native SDK.

```ts
const response = await api.get(`/consultation/video/join/${appointmentId}`);
const { serverUrl, token, roomName } = response.data.video.livekit;

// Pseudocode using LiveKit RN SDK
const room = new Room();
await room.connect(serverUrl, token);
// Render your audio/video tracks using the SDK components.
```

Notes:
- Tokens are user-specific; always request them from the backend.
- You can still keep MiroTalk as the provider for web while using LiveKit in mobile by switching providers per appointment or globally in admin.

## Mobile Helper Endpoint (No Appointment)

When you need a token without an appointment, call:

`POST /api/video/livekit/token`

Body (optional):

```json
{
  "roomName": "mediczy-mobile-room"
}
```

Response includes `video.livekit` and `video.joinUrl`.

## React Native Sample Screen (Helper Endpoint)

```ts
import React, { useState } from 'react';
import { View, Button, Text } from 'react-native';
import { Room } from 'livekit-client';
import api from '../utils/api';

export default function LiveKitQuickJoin() {
  const [status, setStatus] = useState('idle');

  const joinRoom = async () => {
    setStatus('requesting token');
    const response = await api.post('/video/livekit/token', { roomName: 'mediczy-mobile-room' });
    const { serverUrl, token } = response.data.video.livekit;

    setStatus('connecting');
    const room = new Room();
    await room.connect(serverUrl, token);
    setStatus('connected');
  };

  return (
    <View>
      <Button title="Join LiveKit Room" onPress={joinRoom} />
      <Text>Status: {status}</Text>
    </View>
  );
}
```

Replace `api` with your RN API helper and render tracks using LiveKit React Native UI components.
