import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

export interface LiveKitConnection {
  serverUrl: string;
  token: string;
  roomName: string;
}

type DisconnectHandler = () => void;
type ErrorHandler = (error: Error) => void;

interface VideoCallContextValue {
  liveKitConnection: LiveKitConnection | null;
  isMinimized: boolean;
  participantName: string;
  startCall: (connection: LiveKitConnection, name?: string, onDisconnect?: DisconnectHandler, onError?: ErrorHandler) => void;
  endCall: () => void;
  minimize: () => void;
  restore: () => void;
  handleDisconnect: () => void;
  handleError: (error: Error) => void;
}

const VideoCallContext = createContext<VideoCallContextValue | null>(null);

export function VideoCallProvider({ children }: { children: ReactNode }) {
  const [liveKitConnection, setLiveKitConnection] = useState<LiveKitConnection | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [participantName, setParticipantName] = useState("Patient");
  const onDisconnectRef = useRef<DisconnectHandler | undefined>(undefined);
  const onErrorRef = useRef<ErrorHandler | undefined>(undefined);

  const startCall = useCallback((
    connection: LiveKitConnection,
    name = "Patient",
    onDisconnect?: DisconnectHandler,
    onError?: ErrorHandler,
  ) => {
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
    setLiveKitConnection(connection);
    setParticipantName(name);
    setIsMinimized(false);
  }, []);

  const endCall = useCallback(() => {
    setLiveKitConnection(null);
    setIsMinimized(false);
    onDisconnectRef.current = undefined;
    onErrorRef.current = undefined;
  }, []);

  const minimize = useCallback(() => setIsMinimized(true), []);
  const restore = useCallback(() => setIsMinimized(false), []);

  const handleDisconnect = useCallback(() => {
    onDisconnectRef.current?.();
    setLiveKitConnection(null);
    setIsMinimized(false);
  }, []);

  const handleError = useCallback((error: Error) => {
    onErrorRef.current?.(error);
  }, []);

  return (
    <VideoCallContext.Provider value={{
      liveKitConnection, isMinimized, participantName,
      startCall, endCall, minimize, restore, handleDisconnect, handleError,
    }}>
      {children}
    </VideoCallContext.Provider>
  );
}

export function useVideoCall() {
  const ctx = useContext(VideoCallContext);
  if (!ctx) throw new Error("useVideoCall must be used inside VideoCallProvider");
  return ctx;
}
