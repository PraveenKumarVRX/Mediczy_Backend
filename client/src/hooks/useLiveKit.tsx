import { useState, useRef, useCallback, useEffect } from "react";
import api from "@/utils/api";

interface UseLiveKitProps {
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
}

/**
 * Simplified LiveKit hook for video calls.
 * Instead of managing WebRTC directly, this hook manages LiveKit room URLs
 * and opens them in new windows or iframes.
 * 
 * This replaces the old useMirotalk hook with a LiveKit-based implementation.
 */
export const useLiveKit = ({ onUserJoined, onUserLeft }: UseLiveKitProps = {}) => {
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const windowRef = useRef<Window | null>(null);

  const LIVEKIT_URL = (import.meta.env.VITE_LIVEKIT_MEET_URL || import.meta.env.VITE_LIVEKIT_URL || 'https://video.mediqzy.com')
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/+$/, '')
    .replace(/\/rooms?$/, '');

  /**
   * Get a LiveKit join URL for the given room
   */
  const getJoinUrl = useCallback(async (roomId: string, userName: string): Promise<string | null> => {
    try {
      const response = await api.post('/consultation/video/create-meeting', {
        roomId,
        userName,
        provider: 'livekit'
      });
      
      if (response.data.success && response.data.video?.joinUrl) {
        return response.data.video.joinUrl;
      }
      
      // Fallback to generic LiveKit URL
      return `${LIVEKIT_URL}/rooms/${roomId}?name=${encodeURIComponent(userName)}`;
    } catch (error) {
      console.error('Failed to get LiveKit join URL:', error);
      return `${LIVEKIT_URL}/rooms/${roomId}?name=${encodeURIComponent(userName)}`;
    }
  }, [LIVEKIT_URL]);

  /**
   * Join a LiveKit room - opens in new window
   */
  const joinChannel = useCallback(async (roomId: string, userId: string, userName?: string): Promise<void> => {
    setIsLoading(true);
    
    try {
      const name = userName || `User-${userId.slice(-4)}`;
      const url = await getJoinUrl(roomId, name);
      
      if (url) {
        // Open LiveKit in a new window
        windowRef.current = window.open(url, '_blank', 'width=1280,height=720');
        setJoinUrl(url);
        setCurrentRoom(roomId);
        setIsJoined(true);
        onUserJoined?.(userId);
      }
    } catch (error) {
      console.error('Failed to join LiveKit room:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [getJoinUrl, onUserJoined]);

  /**
   * Leave the current room
   */
  const leaveChannel = useCallback(() => {
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.close();
    }
    windowRef.current = null;
    
    const room = currentRoom;
    setCurrentRoom(null);
    setJoinUrl(null);
    setIsJoined(false);
    
    if (room) {
      onUserLeft?.(room);
    }
  }, [currentRoom, onUserLeft]);

  /**
   * Toggle video - no-op for window-based approach
   * The LiveKit UI handles this internally
   */
  const toggleVideo = useCallback(() => {
    console.log('Video toggle handled by LiveKit UI');
  }, []);

  /**
   * Toggle audio - no-op for window-based approach
   * The LiveKit UI handles this internally
   */
  const toggleAudio = useCallback(() => {
    console.log('Audio toggle handled by LiveKit UI');
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (windowRef.current && !windowRef.current.closed) {
        windowRef.current.close();
      }
    };
  }, []);

  return {
    // Compatibility properties for legacy hook interface
    localStream: null,
    remoteStreams: new Map(),
    isJoined,
    isLoading,
    joinChannel,
    leaveChannel,
    toggleVideo,
    toggleAudio,
    // LiveKit specific
    joinUrl,
    currentRoom,
  };
};

export default useLiveKit;
