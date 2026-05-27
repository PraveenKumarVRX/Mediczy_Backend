import { useEffect, useState, useCallback, useRef } from 'react';
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
import { Maximize2, Minimize2, PhoneOff, X, Users, Wifi, WifiOff } from 'lucide-react';

interface LiveKitRoomProps {
  serverUrl: string;
  token: string;
  roomName: string;
  participantName: string;
  iceServers?: RTCIceServer[];
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  /** Override which controls are shown. Defaults to { screenShare: false } for medical calls */
  controls?: ControlBarControls;
  /** When true, starts with camera OFF (audio-only call) */
  audioOnly?: boolean;
  /** Render the active call as a compact floating window */
  isMinimized?: boolean;
  onMinimize?: () => void;
  onRestore?: () => void;
  /** Fill the parent container instead of taking the full viewport (fixed inset-0) */
  inline?: boolean;
}

/**
 * CameraEnabler — renders inside an LKRoom context and enables the local camera
 * after a short delay so that audio SDP negotiation completes first, preventing
 * the "could not createOffer with closed peer connection" race condition.
 */
function CameraEnabler({ enabled }: { enabled: boolean }) {
  const room = useRoomContext();
  const enabledOnce = useRef(false);

  useEffect(() => {
    if (!enabled || enabledOnce.current) return;
    const enableCamera = () => {
      if (enabledOnce.current || room.state !== ConnectionState.Connected) return;
      enabledOnce.current = true;
      room.localParticipant.setCameraEnabled(true).catch((err) => {
        console.warn('CameraEnabler: setCameraEnabled failed', err);
      });
    };

    enableCamera();
    room.on(RoomEvent.ConnectionStateChanged, enableCamera);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, enableCamera);
    };
  }, [room, enabled]);

  return null;
}

/**
 * Medical video layout — same as VideoConference but without screen share by default.
 * Uses GridLayout for multiple participants, with ControlBar controls prop.
 */
function MedicalVideoLayout({ controls }: { controls?: ControlBarControls }) {
  const tracks = useTracks(
    [
      // Avoid placeholder track churn during reconnect; it can desync GridLayout paging.
      { source: Track.Source.Camera, withPlaceholder: false },
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
  iceServers,
  controls,
  audioOnly = false,
  isMinimized = false,
  onMinimize,
  onRestore,
  inline = false,
}: LiveKitRoomProps) {
  const [error, setError] = useState<string | null>(null);
  // Incremented on disconnect to force fresh GridLayout mount, preventing stale
  // placeholder track IDs from crashing updatePages() during reconnect.
  const [layoutKey, setLayoutKey] = useState(0);
  // Switch to relay-only ICE on pc-connection failure (restrictive corporate networks)
  const [useRelayOnly, setUseRelayOnly] = useState(false);

  // Guard: never attempt LiveKit connection without credentials
  if (!serverUrl || !token) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">⚠️ Video credentials missing</p>
          <p className="text-slate-400 text-sm">Cannot connect without a valid token.</p>
          {onDisconnect && (
            <button
              className="mt-2 px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm text-white"
              onClick={onDisconnect}
            >
              Return
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleDisconnect = useCallback(() => {
    onDisconnect?.();
  }, [onDisconnect]);

  const handleRoomDisconnected = useCallback(() => {
    // Keep component mounted so LiveKit SDK can finish its own reconnect flow.
    console.warn('LiveKit disconnected event received; waiting for SDK reconnect handling.');
  }, []);

  const handleError = useCallback((err: Error) => {
    console.error('LiveKit error:', err);
    const isSignalError = err.message?.includes('Abort handler') ||
      err.message?.includes('signal connection') ||
      err.message?.includes('timed out');

    // Let LiveKit SDK handle transient signal issues internally.
    if (isSignalError) {
      console.warn('LiveKit transient signal issue; SDK reconnect in progress.');
      return;
    }

    // ICE/pc failure on 'all' policy → retry once with relay-only (restrictive network)
    const isPcFailure = err.message?.includes('could not establish pc') ||
      err.message?.includes('ConnectionError');
    if (isPcFailure && !useRelayOnly) {
      console.warn('ICE failed — retrying with relay-only policy (TURN forced)');
      setUseRelayOnly(true);
      setLayoutKey(k => k + 1);
      return;
    }

    setError(err.message);
    onError?.(err);
  }, [onError, useRelayOnly]);

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

  const shellClassName = isMinimized
    ? 'fixed bottom-4 right-4 z-50 h-[260px] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl'
    : inline
      ? 'h-full w-full bg-slate-900'
      : 'fixed inset-0 bg-slate-900 z-50';

  const roomStyle = isMinimized
    ? { height: '260px', width: '100%' }
    : inline
      ? { height: '100%', width: '100%' }
      : { height: '100vh', width: '100vw' };
  const hasCustomIceServers = Array.isArray(iceServers) && iceServers.length > 0;
  const rtcConfig = {
    ...(hasCustomIceServers ? { iceServers } : {}),
    ...(useRelayOnly ? { iceTransportPolicy: 'relay' as RTCIceTransportPolicy } : {}),
  };
  const connectOptions = {
    peerConnectionTimeout: 30000,
    ...(Object.keys(rtcConfig).length > 0 ? { rtcConfig } : {}),
  };

  return (
    <div className={shellClassName} data-lk-theme="default">
      <LKRoom
        key={layoutKey}
        serverUrl={serverUrl}
        token={token}
        connect={true}
        video={false}
        audio={true}
        onConnected={handleConnected}
        onDisconnected={handleRoomDisconnected}
        onError={handleError}
        connectOptions={connectOptions}
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
        style={roomStyle}
      >
        <LayoutContextProvider>
          {/* Custom header overlay */}
          <div className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between bg-gradient-to-b from-slate-900/80 to-transparent ${isMinimized ? 'p-2' : 'p-4'}`}>
            <div className="flex min-w-0 items-center gap-2">
              <div className="px-3 py-1.5 rounded-full bg-slate-700/50 text-xs font-medium text-white">
                {roomName}
              </div>
              {!isMinimized && <ConnectionIndicator />}
              {!isMinimized && <ParticipantsBadge />}
            </div>
            <div className="flex items-center gap-2">
              {isMinimized ? (
                <Button
                  onClick={onRestore}
                  variant="secondary"
                  size="sm"
                  className="h-8 px-2"
                  title="Restore call"
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              ) : (
                onMinimize && (
                  <Button
                    onClick={onMinimize}
                    variant="secondary"
                    size="sm"
                    className="h-8 px-2"
                    title="Minimize call"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </Button>
                )
              )}
              <Button
                onClick={handleDisconnect}
                variant="destructive"
                size="sm"
                className="flex items-center gap-2"
              >
                <PhoneOff className="w-4 h-4" />
                {!isMinimized && 'End Call'}
              </Button>
            </div>
          </div>

          <CameraEnabler enabled={!audioOnly} />
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
  iceServers,
  onDisconnect,
  onRemoteVideo,
  onRemoteAudio,
  controls,
}: {
  serverUrl: string;
  token: string;
  iceServers?: RTCIceServer[];
  onDisconnect?: () => void;
  /** Callback fired when a remote participant's camera video element is available (or null when lost) */
  onRemoteVideo?: (video: HTMLVideoElement | null) => void;
  /** Callback fired when a remote participant's audio MediaStream is available (or null when lost) */
  onRemoteAudio?: (stream: MediaStream | null) => void;
  /** Override which controls are shown. Defaults to { screenShare: false } */
  controls?: ControlBarControls;
}) {
  // Guard: never mount LiveKit connection without valid credentials
  if (!serverUrl || !token) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">⚠️ Video credentials missing</p>
          <p className="text-slate-400 text-sm">Cannot connect without a valid token.</p>
          {onDisconnect && (
            <button
              className="mt-2 px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm text-white"
              onClick={onDisconnect}
            >
              Return
            </button>
          )}
        </div>
      </div>
    );
  }

  const hasCustomIceServers = Array.isArray(iceServers) && iceServers.length > 0;

  return (
    <div className="h-full w-full" data-lk-theme="default">
      <LKRoom
        serverUrl={serverUrl}
        token={token}
        connect={true}
        video={false}
        audio={true}
        style={{ height: '100%', width: '100%' }}
        onDisconnected={() => {
          // Keep embedded room mounted during transient reconnect cycles.
          console.warn('SimpleLiveKitRoom disconnected event received; waiting for reconnect flow.');
        }}
        connectOptions={{
          peerConnectionTimeout: 30000,
          ...(hasCustomIceServers ? { rtcConfig: { iceServers } } : {}),
        }}
      >
        <LayoutContextProvider>
          {/* Enable camera after audio negotiates to prevent SDP race */}
          <CameraEnabler enabled={true} />
          <MedicalVideoLayout controls={controls} />
          <RoomAudioRenderer />
          {onRemoteVideo && <RemoteVideoCapture onRemoteVideo={onRemoteVideo} />}
          {onRemoteAudio && <RemoteAudioCapture onRemoteAudio={onRemoteAudio} />}
        </LayoutContextProvider>
      </LKRoom>
    </div>
  );
}
