import { useEffect, useState, useCallback } from 'react';
import {
  LiveKitRoom as LKRoom,
  LayoutContextProvider,
  RoomAudioRenderer,
  useRoomContext,
  useParticipants,
  useTracks,
  ParticipantTile,
  ControlBar,
  GridLayout,
  type ControlBarControls,
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
  /** Override which controls are shown. Defaults to { screenShare: false } for medical calls */
  controls?: ControlBarControls;
}

/**
 * Medical video layout — same as VideoConference but without screen share by default.
 * Uses GridLayout for multiple participants, with ControlBar controls prop.
 */
function MedicalVideoLayout({ controls }: { controls?: ControlBarControls }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const mergedControls: ControlBarControls = {
    screenShare: false,
    chat: true,
    ...controls,
  };

  return (
    <div className="lk-video-conference" style={{ height: '100%' }}>
      <div className="lk-video-conference-inner" style={{ flex: 1 }}>
        <div className="lk-grid-layout-wrapper" style={{ height: '100%' }}>
          <GridLayout tracks={tracks}>
            <ParticipantTile />
          </GridLayout>
        </div>
      </div>
      <ControlBar controls={mergedControls} variation="verbose" />
    </div>
  );
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
  controls,
}: LiveKitRoomProps) {
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  const handleDisconnect = useCallback(() => {
    onDisconnect?.();
  }, [onDisconnect]);

  const handleError = useCallback((err: Error) => {
    console.error('LiveKit error:', err);
    const isSignalError = err.message?.includes('Abort handler') ||
      err.message?.includes('signal connection') ||
      err.message?.includes('timed out');
    
    // Auto-retry signal errors up to MAX_RETRIES times
    if (isSignalError && retryCount < MAX_RETRIES) {
      console.log(`🔄 LiveKit auto-retry ${retryCount + 1}/${MAX_RETRIES}...`);
      setRetryCount(prev => prev + 1);
      setError(null); // Clear error to re-render LKRoom
      return;
    }
    
    setError(err.message);
    onError?.(err);
  }, [onError, retryCount]);

  const handleConnected = useCallback(() => {
    console.log('✅ Connected to LiveKit room:', roomName);
    setError(null);
    setRetryCount(0);
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
        <LayoutContextProvider>
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

          {/* Main video conference area — no screen share */}
          <MedicalVideoLayout controls={controls} />
          
          {/* Audio renderer */}
          <RoomAudioRenderer />
        </LayoutContextProvider>
      </LKRoom>
    </div>
  );
}

/**
 * RemoteAudioCapture — captures the remote participant's audio track
 * as a MediaStream and exposes it via callback.
 * Must be rendered INSIDE an <LKRoom> context.
 */
function RemoteAudioCapture({
  onRemoteAudio,
}: {
  onRemoteAudio?: (stream: MediaStream | null) => void;
}) {
  const tracks = useTracks(
    [{ source: Track.Source.Microphone, withPlaceholder: false }],
    { onlySubscribed: true },
  );

  // Find the first remote audio track
  const remoteTrack = tracks.find(
    (t) => t.participant?.isLocal === false && t.publication?.track,
  );

  useEffect(() => {
    if (!remoteTrack?.publication?.track) {
      onRemoteAudio?.(null);
      return;
    }
    // Get the MediaStream from the remote audio track
    const mediaStreamTrack = remoteTrack.publication.track.mediaStreamTrack;
    if (mediaStreamTrack) {
      const stream = new MediaStream([mediaStreamTrack]);
      onRemoteAudio?.(stream);
    }
    return () => {
      onRemoteAudio?.(null);
    };
  }, [remoteTrack?.publication?.track, onRemoteAudio]);

  return null; // No DOM element needed for audio
}

/**
 * RemoteVideoCapture — captures the remote participant's camera track
 * into a hidden <video> element and exposes it via callback.
 * Must be rendered INSIDE an <LKRoom> context.
 */
function RemoteVideoCapture({
  onRemoteVideo,
}: {
  onRemoteVideo?: (video: HTMLVideoElement | null) => void;
}) {
  const videoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      onRemoteVideo?.(node);
    },
    [onRemoteVideo],
  );

  // Subscribe to all camera tracks (local + remote)
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: true },
  );

  // Find the first remote camera track
  const remoteTrack = tracks.find(
    (t) => t.participant?.isLocal === false && t.publication?.track,
  );

  useEffect(() => {
    if (!remoteTrack?.publication?.track) {
      onRemoteVideo?.(null);
      return;
    }
    // Attach the track to the hidden video element
    const el = document.getElementById('__remote-capture-video') as HTMLVideoElement | null;
    if (el) {
      remoteTrack.publication.track.attach(el);
      onRemoteVideo?.(el);
    }
    return () => {
      if (el) {
        remoteTrack.publication?.track?.detach(el);
      }
    };
  }, [remoteTrack?.publication?.track, onRemoteVideo]);

  return (
    <video
      id="__remote-capture-video"
      ref={videoRef}
      className="hidden"
      muted
      playsInline
      style={{ width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }}
    />
  );
}

// Simplified room component for embedding (medical calls — no screen share)
export function SimpleLiveKitRoom({
  serverUrl,
  token,
  onDisconnect,
  onRemoteVideo,
  onRemoteAudio,
  controls,
}: {
  serverUrl: string;
  token: string;
  onDisconnect?: () => void;
  /** Callback fired when a remote participant's camera video element is available (or null when lost) */
  onRemoteVideo?: (video: HTMLVideoElement | null) => void;
  /** Callback fired when a remote participant's audio MediaStream is available (or null when lost) */
  onRemoteAudio?: (stream: MediaStream | null) => void;
  /** Override which controls are shown. Defaults to { screenShare: false } */
  controls?: ControlBarControls;
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
        <MedicalVideoLayout controls={controls} />
        <RoomAudioRenderer />
        {onRemoteVideo && <RemoteVideoCapture onRemoteVideo={onRemoteVideo} />}
        {onRemoteAudio && <RemoteAudioCapture onRemoteAudio={onRemoteAudio} />}
      </LKRoom>
    </div>
  );
}
