import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Phone } from "lucide-react";
import { randomID } from "@/lib/utils";
import io, { Socket } from "socket.io-client";

const VideoCallTest = () => {
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [testUserId] = useState(() => {
    const id = `test_user_${randomID(6)}`;
    console.log("Generated test user ID:", id);
    return id;
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("Ready to start video call");
  
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<string | null>(null);

  // Initialize socket connection for testing
  useEffect(() => {
    const testSocket = io("http://localhost:8000", {
      query: {
        userId: testUserId,
        userType: "user",
      },
    });
    
    setSocket(testSocket);
    console.log("🔌 Test socket connected for user:", testUserId);

    // Listen for socket events
    testSocket.on("mirotalk-offer", async (data) => {
      console.log("📥 Received offer:", data);
      // Handle WebRTC offer
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        testSocket.emit("mirotalk-answer", { 
          channel: channelRef.current, 
          sdp: answer.sdp, 
          type: answer.type,
          uid: testUserId 
        });
      }
    });

    testSocket.on("mirotalk-answer", async (data) => {
      console.log("📥 Received answer:", data);
      // Handle WebRTC answer
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
      }
    });

    testSocket.on("mirotalk-ice", async (data) => {
      console.log("📥 Received ICE candidate:", data);
      // Handle ICE candidate
      if (pcRef.current) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    return () => {
      testSocket.disconnect();
    };
  }, [testUserId]);

  // Create WebRTC peer connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log("📤 Sending ICE candidate");
        socket.emit("mirotalk-ice", {
          channel: channelRef.current,
          candidate: event.candidate,
          uid: testUserId
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("📥 Received remote stream");
      setRemoteStreams(prev => [...prev, event.streams[0]]);
    };

    return pc;
  };

  const joinChannel = async (channelName: string, uid: string) => {
    channelRef.current = channelName;
    setIsLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      pcRef.current = pc;
      setIsJoined(true);
      setStatus("Joined channel");
      return true;
    } catch (e) {
      console.error("Failed to join channel", e);
      setStatus("Join failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const leaveChannel = async () => {
    setIsLoading(true);
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach(s => s.track && s.track.stop());
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        setLocalStream(null);
      }
      setRemoteStreams([]);
      setIsJoined(false);
      setIsVideoCall(false);
      setStatus("Disconnected");
    } finally {
      setIsLoading(false);
    }
  };

  const startVideoCall = async () => {
    const channelName = `test_miro_${randomID(8)}`;
    console.log("🚀 Starting video call in channel:", channelName);
    if (!testUserId) {
      console.error("❌ No test user ID available");
      return;
    }
    const success = await joinChannel(channelName, testUserId);
    if (success) {
      setIsVideoCall(true);
      console.log("✅ Successfully joined channel");
    } else {
      console.error("❌ Failed to join channel");
    }
  };

  const endVideoCall = async () => {
    await leaveChannel();
    console.log("✅ Video call ended");
  };

  const toggleVideo = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach(track => (track.enabled = !track.enabled));
    setStatus(localStream.getVideoTracks()[0].enabled ? "Video enabled" : "Video disabled");
  };

  const toggleAudio = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(track => (track.enabled = !track.enabled));
    setStatus(localStream.getAudioTracks()[0].enabled ? "Audio unmuted" : "Audio muted");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="w-6 h-6" />
              MiroTalk Video Call Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Test User ID:</span>
                <code className="bg-gray-100 px-2 py-1 rounded">{testUserId}</code>
              </div>
              
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Status:</span>
                <span className={`px-2 py-1 rounded text-sm ${
                  isLoading ? "bg-yellow-100 text-yellow-800" :
                  isJoined ? "bg-green-100 text-green-800" : 
                  "bg-gray-100 text-gray-800"
                }`}>
                  {isLoading ? "Connecting..." : isJoined ? "Connected" : "Disconnected"}
                </span>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={startVideoCall} 
                  disabled={isJoined || isLoading}
                  className="flex items-center gap-2"
                >
                  <Video className="w-4 h-4" />
                  Start Video Call
                </Button>
                
                <Button 
                  variant="destructive"
                  onClick={endVideoCall} 
                  disabled={!isJoined}
                >
                  End Call
                </Button>
              </div>

              {isJoined && (
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => toggleVideo()}
                    size="sm"
                  >
                    {localStream?.getVideoTracks()[0]?.enabled ? "Turn Off Video" : "Turn On Video"}
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={() => toggleAudio()}
                    size="sm"
                  >
                    {localStream?.getAudioTracks()[0]?.enabled ? "Mute" : "Unmute"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Video Call Area */}
        {isVideoCall && (
          <Card>
            <CardHeader>
              <CardTitle>Video Call Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative bg-black rounded-lg h-96 overflow-hidden">
                {/* Local video preview */}
                {localStream && (
                  <video
                    ref={localVideoRef}
                    className="absolute top-4 right-4 w-32 h-24 bg-gray-800 rounded object-cover z-10"
                    autoPlay
                    playsInline
                    muted
                  />
                )}

                {/* Remote streams */}
                {remoteStreams.length > 0 ? (
                  <div className="w-full h-full">
                    {remoteStreams.map((stream) => (
                      <div key={stream.id} className="w-full h-full">
                        <video
                          className="w-full h-full object-cover"
                          ref={(el) => {
                            if (el) {
                              try {
                                el.srcObject = stream;
                              } catch (e) {
                                console.warn("Failed to set remote stream:", e);
                              }
                            }
                          }}
                          autoPlay
                          playsInline
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-white">
                    <div className="text-center">
                      <div className="text-lg mb-2">
                        {localStream ? "Waiting for other participants..." : "Getting camera access..."}
                      </div>
                      <div className="text-sm opacity-75">
                        Open this page in another browser window to test P2P connection
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 text-sm text-gray-600">
                <div>Local stream: {localStream ? "✅ Active" : "❌ None"}</div>
                <div>Remote streams: {remoteStreams.length}</div>
                <div>Check browser console for detailed logs</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VideoCallTest;