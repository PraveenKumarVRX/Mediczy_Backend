import { useState, useCallback, useRef, useEffect } from 'react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

interface AgoraUser {
  uid: string | number;
  videoTrack?: any;
  audioTrack?: any;
}

interface UseAgoraProps {
  appId: string;
  onUserJoined?: (user: AgoraUser) => void;
  onUserLeft?: (user: AgoraUser) => void;
}

export const useAgora = ({ appId, onUserJoined, onUserLeft }: UseAgoraProps) => {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<AgoraUser[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize Agora client
  const initClient = useCallback(() => {
    const agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    
    agoraClient.on("user-published", async (user, mediaType) => {
      await agoraClient.subscribe(user, mediaType);
      
      if (mediaType === "video") {
        setRemoteUsers(prev => {
          const filtered = prev.filter(u => u.uid !== user.uid);
          return [...filtered, user];
        });
        onUserJoined?.(user);
      }
      
      if (mediaType === "audio") {
        user.audioTrack?.play();
      }
    });

    agoraClient.on("user-unpublished", (user) => {
      setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
    });

    agoraClient.on("user-left", (user) => {
      setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
      onUserLeft?.(user);
    });

    setClient(agoraClient);
    return agoraClient;
  }, [onUserJoined, onUserLeft]);

  // Join channel
  const joinChannel = useCallback(async (
    channelName: string, 
    uid: string | number, 
    token: string | null = null
  ) => {
    if (!client) return false;

    setIsLoading(true);
    
    try {
      // Create local tracks
      const videoTrack = await AgoraRTC.createCameraVideoTrack();
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();

      setLocalVideoTrack(videoTrack);
      setLocalAudioTrack(audioTrack);

      // Join channel
      await client.join(appId, channelName, token, uid);

      // Publish local tracks
      await client.publish([videoTrack, audioTrack]);

      setIsJoined(true);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error("Failed to join channel:", error);
      setIsLoading(false);
      return false;
    }
  }, [client, appId]);

  // Leave channel
  const leaveChannel = useCallback(async () => {
    if (!client) return;

    try {
      // Close local tracks
      if (localVideoTrack) {
        localVideoTrack.close();
        setLocalVideoTrack(null);
      }
      if (localAudioTrack) {
        localAudioTrack.close();
        setLocalAudioTrack(null);
      }

      // Leave channel
      if (isJoined) {
        await client.leave();
        setIsJoined(false);
      }

      // Clear remote users
      setRemoteUsers([]);
    } catch (error) {
      console.error("Failed to leave channel:", error);
    }
  }, [client, localVideoTrack, localAudioTrack, isJoined]);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!localVideoTrack) return false;
    
    const enabled = localVideoTrack.enabled;
    await localVideoTrack.setEnabled(!enabled);
    return !enabled;
  }, [localVideoTrack]);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!localAudioTrack) return false;
    
    const enabled = localAudioTrack.enabled;
    await localAudioTrack.setEnabled(!enabled);
    return !enabled;
  }, [localAudioTrack]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveChannel();
    };
  }, [leaveChannel]);

  return {
    client,
    localVideoTrack,
    localAudioTrack,
    remoteUsers,
    isJoined,
    isLoading,
    initClient,
    joinChannel,
    leaveChannel,
    toggleVideo,
    toggleAudio,
  };
};

export default useAgora;