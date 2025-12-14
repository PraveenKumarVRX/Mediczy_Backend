import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "@/context/SocketContext";

interface RemoteStream {
  id: string;
  stream: MediaStream;
}

interface UseMirotalkProps {
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
}

export const useMirotalk = ({ onUserJoined, onUserLeft }: UseMirotalkProps = {}) => {
  const { socket } = useSocket();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const channelRef = useRef<string | null>(null);

  // Initialize listeners
  const initClient = useCallback(() => {
    // Nothing heavy to init client-side; ensure socket exists
    return !!socket;
  }, [socket]);

  const createPeerConnection = (channel: string, uid: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.ontrack = (event) => {
      const stream = event.streams && event.streams[0];
      if (!stream) return;
      const id = stream.id || `${channel}-${uid}-${Math.random().toString(36).slice(2,8)}`;
      setRemoteStreams((prev) => {
        if (prev.find((r) => r.id === id)) return prev;
        onUserJoined?.(id);
        return [...prev, { id, stream }];
      });
    };

    pc.onicecandidate = (evt) => {
      if (evt.candidate && socket && channel) {
        socket.emit("mirotalk-ice", { channel, candidate: evt.candidate });
      }
    };

    return pc;
  };

  const joinChannel = useCallback(async (channel: string, uid: string) => {
    if (!socket) return false;
    setIsLoading(true);
    channelRef.current = channel;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);

      const pc = createPeerConnection(channel, uid);
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to server (SFU) via socket
      socket.emit("mirotalk-offer", { channel, sdp: offer.sdp, type: offer.type, uid });

      // Listen for answer
      socket.on("mirotalk-answer", async (data: any) => {
        if (!data || data.channel !== channel) return;
        const desc = { type: data.type || "answer", sdp: data.sdp } as RTCSessionDescriptionInit;
        try {
          await pc.setRemoteDescription(desc);
        } catch (err) {
          console.error("Failed to set remote description:", err);
        }
      });

      // Listen for remote ICE candidates
      socket.on("mirotalk-ice", async (data: any) => {
        if (!data || data.channel !== channel || !data.candidate) return;
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          console.error("Failed to add ICE candidate:", err);
        }
      });

      // Also listen for peer-leave events
      socket.on("mirotalk-user-left", (data: any) => {
        if (!data || data.channel !== channel) return;
        // remove remote streams belonging to that user
        setRemoteStreams((prev) => prev.filter((r) => !r.id.includes(data.userId)));
        onUserLeft?.(data.userId);
      });

      // Notify server we joined
      socket.emit("mirotalk-join", { channel, uid });

      setIsJoined(true);
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error("Failed to join MiroTalk channel:", error);
      setIsLoading(false);
      return false;
    }
  }, [socket, onUserJoined, onUserLeft]);

  const leaveChannel = useCallback(async () => {
    const channel = channelRef.current;
    try {
      // Stop local tracks
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        setLocalStream(null);
      }

      // Close peer connection
      if (pcRef.current) {
        try { pcRef.current.close(); } catch (e) { /* ignore */ }
        pcRef.current = null;
      }

      // Clear remote streams
      setRemoteStreams([]);

      if (socket && channel) socket.emit("mirotalk-leave", { channel });

      channelRef.current = null;
      setIsJoined(false);
    } catch (err) {
      console.error("Error leaving channel:", err);
    }
  }, [localStream, socket]);

  const toggleVideo = useCallback(async () => {
    if (!localStream) return false;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return false;
    videoTrack.enabled = !videoTrack.enabled;
    return videoTrack.enabled;
  }, [localStream]);

  const toggleAudio = useCallback(async () => {
    if (!localStream) return false;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return false;
    audioTrack.enabled = !audioTrack.enabled;
    return audioTrack.enabled;
  }, [localStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveChannel();
    };
  }, [leaveChannel]);

  return {
    localStream,
    remoteStreams,
    isJoined,
    isLoading,
    initClient,
    joinChannel,
    leaveChannel,
    toggleVideo,
    toggleAudio,
  };
};

export default useMirotalk;
