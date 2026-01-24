import { useEffect, useState, useCallback } from 'react';
import {
  LiveKitRoom as LKRoom,
  VideoConference,
  RoomAudioRenderer,
  useRoomContext,
  useParticipants,
  useTracks,
  ParticipantTile,
  TrackRefContext,
  ControlBar,
} from '@livekit/components-react';
import { Track, RoomEvent, ConnectionState } from 'livekit-client';
// Import LiveKit component styles - order matters!
import '@livekit/components-styles';
import { Button } from '@/components/ui/button';
import { PhoneOff, X, Users, Wifi, WifiOff } from 'lucide-react';

interface LiveKitRoomProps {
  serverUrl: string;
  token: string;
  roomName: string;
  participantName: string;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

// Connection status indicator
function ConnectionIndicator() {
  const room = useRoomContext();
  const [status, setStatus] = useState<ConnectionState>(ConnectionState.Connecting);

  useEffect(() => {
    const updateStatus = () => setStatus(room.state);
    updateStatus();
    room.on(RoomEvent.ConnectionStateChanged, updateStatus);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, updateStatus);
    };
  }, [room]);

  const isConnected = status === ConnectionState.Connected;
  
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
      isConnected ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
    }`}>
      {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      {isConnected ? 'Connected' : 'Connecting...'}
    </div>
  );
}

// Participant count badge
function ParticipantsBadge() {
  const participants = useParticipants();
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-700/50 text-xs font-medium text-slate-300">
      <Users className="w-3 h-3" />
      {participants.length}
    </div>
  );
}

export default function LiveKitRoom({
  serverUrl,
  token,
  roomName,
  participantName,
  onDisconnect,
  onError,
}: LiveKitRoomProps) {
  const [error, setError] = useState<string | null>(null);

  const handleDisconnect = useCallback(() => {
    onDisconnect?.();
  }, [onDisconnect]);

  const handleError = useCallback((err: Error) => {
    console.error('LiveKit error:', err);
    setError(err.message);
    onError?.(err);
  }, [onError]);

  const handleConnected = useCallback(() => {
    console.log('✅ Connected to LiveKit room:', roomName);
    setError(null);
  }, [roomName]);

  if (error) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-900 text-white z-50">
        <div className="text-center p-8">
          <X className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold mb-2">Connection Error</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <Button onClick={handleDisconnect} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900 z-50" data-lk-theme="default">
      <LKRoom
        serverUrl={serverUrl}
        token={token}
        connect={true}
        video={true}
        audio={true}
        onConnected={handleConnected}
        onDisconnected={handleDisconnect}
        onError={handleError}
        options={{
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: { width: 1280, height: 720, frameRate: 30 },
          },
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }}
        style={{ height: '100vh', width: '100vw' }}
      >
        {/* Custom header overlay */}
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-slate-900/80 to-transparent">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-full bg-slate-700/50 text-xs font-medium text-white">
              {roomName}
            </div>
            <ConnectionIndicator />
            <ParticipantsBadge />
          </div>
          <Button
            onClick={handleDisconnect}
            variant="destructive"
            size="sm"
            className="flex items-center gap-2"
          >
            <PhoneOff className="w-4 h-4" />
            End Call
          </Button>
        </div>

        {/* Main video conference area */}
        <VideoConference />
        
        {/* Audio renderer */}
        <RoomAudioRenderer />
      </LKRoom>
    </div>
  );
}

// Simplified room component for embedding
export function SimpleLiveKitRoom({
  serverUrl,
  token,
  onDisconnect,
}: {
  serverUrl: string;
  token: string;
  onDisconnect?: () => void;
}) {
  return (
    <div className="h-full w-full" data-lk-theme="default">
      <LKRoom
        serverUrl={serverUrl}
        token={token}
        connect={true}
        video={true}
        audio={true}
        style={{ height: '100%', width: '100%' }}
        onDisconnected={onDisconnect}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LKRoom>
    </div>
  );
}
