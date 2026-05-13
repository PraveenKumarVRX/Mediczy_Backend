// Sample LiveKit Video Call Screen for React Native (bare or Expo with custom dev client)
// Install dependencies: @livekit/react-native, livekit-client, react-native-webrtc

import React, { useEffect, useRef, useState } from 'react';
import { View, Button, Text, StyleSheet } from 'react-native';
import { Room, Participant, Track } from 'livekit-client';
import { useRoom, useParticipant, RoomContext, LiveKitRoom } from '@livekit/react-native';

// Replace with your backend endpoint to fetch LiveKit token
const LIVEKIT_TOKEN_ENDPOINT = 'https://your-backend.com/video/livekit/token';
const LIVEKIT_WS_URL = 'wss://video.mediqzy.com';

export default function LiveKitVideoCallScreen({ route, navigation }) {
  const { roomName, userName } = route.params || {};
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch LiveKit token from backend
    const fetchToken = async () => {
      try {
        const res = await fetch(LIVEKIT_TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomName, userName })
        });
        const data = await res.json();
        setToken(data?.video?.livekit?.token || data?.token);
      } catch (err) {
        setError('Failed to fetch token');
      }
    };
    fetchToken();
  }, [roomName, userName]);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!token) return <Text>Loading video call...</Text>;

  return (
    <View style={styles.container}>
      <LiveKitRoom
        token={token}
        url={LIVEKIT_WS_URL}
        onDisconnected={() => navigation.goBack()}
        style={styles.room}
      />
      <Button title="Leave Call" onPress={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  room: { flex: 1 },
  error: { color: 'red', margin: 20 }
});
