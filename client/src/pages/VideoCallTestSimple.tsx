import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Phone, VideoOff, MicOff } from "lucide-react";
import { randomID } from "@/lib/utils";
import io from "socket.io-client";
import type { Socket } from "socket.io-client";

const VideoCallTestSimple = () => {
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [testUserId, setTestUserId] = useState(() => {
    const id = `test_user_${randomID(6)}`;
    console.log("Generated test user ID:", id);
    return id;
  });
  const [userIdInput, setUserIdInput] = useState('');
  const [socket, setSocket] = useState<typeof Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("Checking browser compatibility...");
  const [browserSupported, setBrowserSupported] = useState(true);
  
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<string | null>(null);

  // Check browser compatibility on mount
  useEffect(() => {
    const checkBrowserSupport = () => {
      const nav = navigator as any;
      
      // Check WebRTC support
      const win = window as any;
      const hasRTC = !!(win.RTCPeerConnection || win.webkitRTCPeerConnection || win.mozRTCPeerConnection);
      
      // Check getUserMedia support
      const hasGetUserMedia = !!(navigator.mediaDevices?.getUserMedia) ||
        !!(nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia);
      
      // Check if we're in a secure context
      const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const isHttps = location.protocol === 'https:';
      const isSecure = isLocalhost || isHttps;
      const isLAN = location.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./);
      
      if (!hasRTC) {
        setStatus("❌ WebRTC not supported in this browser");
        setBrowserSupported(false);
        return;
      }
      
      if (!hasGetUserMedia) {
        setStatus("❌ Camera access not supported in this browser");
        setBrowserSupported(false);
        return;
      }
      
      if (!isSecure && !isLAN) {
        setStatus("❌ Camera access requires HTTPS or localhost");
        setBrowserSupported(false);
        return;
      }
      
      if (!isSecure && isLAN) {
        setStatus("⚠️ Insecure connection detected. Camera may not work. Enable insecure origins or use HTTPS.");
        setBrowserSupported(true); // Allow testing but with warning
      } else {
        setStatus("✅ Browser compatible - ready to start video call");
        setBrowserSupported(true);
      }
    };
    
    checkBrowserSupport();
  }, []);

  // Initialize socket connection for testing
  useEffect(() => {
    // Use production API URL if available, otherwise current hostname
    const backendUrl = import.meta.env.VITE_SOCKET_URL || 
                       `http://${window.location.hostname}:8000`;
    console.log("🔌 Connecting to backend:", backendUrl);
    
    const testSocket = io(backendUrl, {
      query: {
        userId: testUserId,
        userType: "user",
      },
      timeout: 20000,
      transports: ['websocket', 'polling']
    });
    
    setSocket(testSocket);
    console.log("🔌 Test socket connected for user:", testUserId);

    // Connection events
    testSocket.on("connect", () => {
      console.log("✅ Socket connected successfully");
      setStatus("Socket connected - ready to start video call");
    });

    testSocket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
      setStatus(`Socket connection failed: ${error.message}`);
    });

    testSocket.on("disconnect", (reason) => {
      console.log("🔌 Socket disconnected:", reason);
      setStatus("Socket disconnected");
    });

    // Listen for socket events
    testSocket.on("mirotalk-offer", async (data) => {
      console.log("📥 Received offer:", data);
      try {
        if (pcRef.current && data && data.type && data.sdp) {
          // Validate and clean SDP
          let cleanSdp = data.sdp;
          
          // Fix common SDP issues
          cleanSdp = cleanSdp.replace(/a=setup:actpass\r?\n/g, 'a=setup:active\r\n');
          cleanSdp = cleanSdp.replace(/a=setup:passive\r?\n/g, 'a=setup:active\r\n');
          
          console.log("🔧 Cleaned SDP offer");
          
          const offer = new RTCSessionDescription({
            type: data.type as RTCSdpType,
            sdp: cleanSdp
          });
          
          await pcRef.current.setRemoteDescription(offer);
          console.log("✅ Remote description set");
          
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          console.log("✅ Local description set, sending answer");
          
          testSocket.emit("mirotalk-answer", { 
            channel: channelRef.current, 
            sdp: answer.sdp, 
            type: answer.type,
            uid: testUserId 
          });
        }
      } catch (error) {
        console.error("Error handling offer:", error);
        setStatus(`Error handling offer: ${error.message}`);
      }
    });

    testSocket.on("mirotalk-answer", async (data) => {
      console.log("📥 Received answer:", data);
      try {
        if (pcRef.current && data && data.type && data.sdp) {
          // Validate and clean SDP  
          let cleanSdp = data.sdp;
          
          // Fix common SDP issues
          cleanSdp = cleanSdp.replace(/a=setup:actpass\r?\n/g, 'a=setup:passive\r\n');
          cleanSdp = cleanSdp.replace(/a=setup:active\r?\n/g, 'a=setup:passive\r\n');
          
          console.log("🔧 Cleaned SDP answer");
          
          const answer = new RTCSessionDescription({
            type: data.type as RTCSdpType,
            sdp: cleanSdp
          });
          
          await pcRef.current.setRemoteDescription(answer);
          console.log("✅ Answer processed successfully");
        }
      } catch (error) {
        console.error("Error handling answer:", error);
        setStatus(`Error handling answer: ${error.message}`);
      }
    });

    testSocket.on("mirotalk-ice", async (data) => {
      console.log("📥 Received ICE candidate:", data);
      try {
        if (pcRef.current && data && data.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error("Error handling ICE candidate:", error);
      }
    });

    return () => {
      testSocket.disconnect();
    };
  }, [testUserId]);

  // Create WebRTC peer connection
  const createPeerConnection = () => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'balanced'
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && socket.connected) {
          console.log("📤 Sending ICE candidate:", event.candidate.candidate);
          socket.emit("mirotalk-ice", {
            channel: channelRef.current,
            candidate: event.candidate,
            uid: testUserId
          });
        } else if (!event.candidate) {
          console.log("🔚 ICE gathering completed");
        }
      };

      pc.ontrack = (event) => {
        console.log("📥 Received remote stream");
        console.log("🎵 Remote stream tracks:", event.streams[0].getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })));
        
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          
          // Log audio track info
          const audioTracks = remoteStream.getAudioTracks();
          const videoTracks = remoteStream.getVideoTracks();
          console.log(`📊 Remote: ${videoTracks.length} video tracks, ${audioTracks.length} audio tracks`);
          
          audioTracks.forEach((track, index) => {
            console.log(`🎤 Remote audio track ${index}:`, {
              label: track.label,
              enabled: track.enabled,
              readyState: track.readyState,
              muted: track.muted
            });
          });
          
          setRemoteStreams(prev => {
            // Avoid duplicates
            if (!prev.find(stream => stream.id === remoteStream.id)) {
              return [...prev, remoteStream];
            }
            return prev;
          });
          setStatus("Connected! Remote video and audio should be available.");
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("🔗 Connection state:", pc.connectionState);
        switch (pc.connectionState) {
          case 'connected':
            setStatus("WebRTC connected successfully!");
            break;
          case 'disconnected':
            setStatus("WebRTC disconnected");
            break;
          case 'failed':
            setStatus("WebRTC connection failed - retrying...");
            break;
          case 'closed':
            setStatus("WebRTC connection closed");
            break;
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("🧊 ICE connection state:", pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.log("🔄 ICE connection failed, restarting...");
          pc.restartIce();
        }
      };

      return pc;
    } catch (error) {
      console.error("❌ Error creating peer connection:", error);
      setStatus(`Error creating peer connection: ${error.message}`);
      return null;
    }
  };

  const startVideoCall = async () => {
    console.log("🚀 Starting video call...");
    console.log("🆔 Using test user ID:", testUserId);
    
    if (!socket) {
      console.error("❌ Socket not connected");
      setStatus("Error: Socket not connected - refresh page and try again");
      return;
    }

    if (!socket.connected) {
      console.error("❌ Socket not connected to server");
      setStatus("Error: Not connected to server - check network connection");
      return;
    }

    const channelName = `test_miro_${randomID(8)}`;
    console.log("📺 Channel:", channelName);
    
    setIsLoading(true);
    setStatus("Getting camera access...");
    channelRef.current = channelName;

    try {
      // Check if getUserMedia is supported with better detection
      const nav = navigator as any;
      const hasGetUserMedia = !!(navigator.mediaDevices && 
        navigator.mediaDevices.getUserMedia) ||
        !!(nav.getUserMedia || 
        nav.webkitGetUserMedia || 
        nav.mozGetUserMedia || 
        nav.msGetUserMedia);

      if (!hasGetUserMedia) {
        throw new Error("Camera access not supported. Please use Chrome, Firefox, Safari, or Edge with HTTPS/localhost.");
      }

      // Check if we're in a secure context (HTTPS or localhost)
      const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const isHttps = location.protocol === 'https:';
      
      if (!isLocalhost && !isHttps) {
        throw new Error("Camera access requires HTTPS or localhost. Current URL is not secure.");
      }

      // Try modern API first
      let stream;
      console.log("📷 Requesting camera and microphone access...");
      
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Modern API with enhanced audio constraints
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            facingMode: 'user'
          }, 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 2
          }
        });
      } else {
        // Fallback for older browsers
        const getUserMedia = nav.getUserMedia || 
          nav.webkitGetUserMedia || 
          nav.mozGetUserMedia || 
          nav.msGetUserMedia;
        
        if (!getUserMedia) {
          throw new Error("No getUserMedia support found in this browser");
        }
        
        stream = await new Promise((resolve, reject) => {
          getUserMedia.call(navigator, 
            { video: true, audio: true }, 
            resolve, 
            reject
          );
        });
      }
      
      console.log("✅ Media stream obtained:", stream);
      console.log("📊 Audio tracks:", stream.getAudioTracks().length);
      console.log("📊 Video tracks:", stream.getVideoTracks().length);
      
      // Verify audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn("⚠️ No audio tracks in stream");
        setStatus("Warning: No audio tracks detected");
      } else {
        audioTracks.forEach((track, index) => {
          console.log(`🎤 Audio track ${index}:`, {
            label: track.label,
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted
          });
        });
      }
      
      console.log("✅ Media stream obtained:", stream);
      setLocalStream(stream);
      setStatus("Camera access granted, joining channel...");
      
      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log("📺 Local video attached");
      }

      // Create peer connection
      console.log("🔗 Creating peer connection...");
      pcRef.current = createPeerConnection();
      
      if (!pcRef.current) {
        throw new Error("Failed to create peer connection");
      }
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        if (pcRef.current && stream) {
          pcRef.current.addTrack(track, stream);
          console.log("➕ Added track to peer connection:", track.kind);
        }
      });

      // Join the channel
      console.log("🚪 Joining channel...");
      socket.emit("mirotalk-join", { channel: channelName, uid: testUserId });
      
      // Create and send offer with proper constraints
      console.log("📤 Creating offer...");
      const offer = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false
      });
      
      // Clean the SDP before setting local description
      let cleanSdp = offer.sdp || '';
      cleanSdp = cleanSdp.replace(/a=setup:actpass\r?\n/g, 'a=setup:active\r\n');
      
      const cleanOffer = new RTCSessionDescription({
        type: offer.type,
        sdp: cleanSdp
      });
      
      await pcRef.current.setLocalDescription(cleanOffer);
      console.log("✅ Local description set");
      
      console.log("📤 Sending offer to channel");
      socket.emit("mirotalk-offer", { 
        channel: channelName, 
        sdp: cleanSdp, 
        type: offer.type, 
        uid: testUserId 
      });

      setIsVideoCall(true);
      setStatus("Video call started! Open this URL in another tab to test P2P connection.");
      console.log("✅ Successfully started video call");
      
    } catch (error) {
      console.error("❌ Error starting video call:", error);
      setStatus(`Error: ${error.message || 'Unknown error occurred'}`);
      
      // Cleanup on error
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const endVideoCall = async () => {
    console.log("🛑 Ending video call");
    setStatus("Ending call...");

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Leave channel
    if (socket && channelRef.current) {
      socket.emit("mirotalk-leave", { 
        channel: channelRef.current, 
        uid: testUserId 
      });
    }

    setRemoteStreams([]);
    setIsVideoCall(false);
    channelRef.current = null;
    setStatus("Video call ended");
  };

  // Auto-play videos
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(console.error);
    }
  }, [localStream]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* User ID Configuration */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-lg text-blue-800">👤 User Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-blue-700">Current User ID:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testUserId}
                    onChange={(e) => setTestUserId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter user ID (e.g., user1, user2)"
                  />
                  <Button
                    onClick={() => {
                      const newId = testUserId.trim() || `user_${randomID(4)}`;
                      setTestUserId(newId);
                      console.log("User ID changed to:", newId);
                      setStatus(`User ID set to: ${newId}`);
                    }}
                    variant="outline"
                    size="sm"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Update ID
                  </Button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 text-blue-700">Quick User IDs (Click to select):</label>
                <div className="flex gap-2 flex-wrap">
                  {['user1', 'user2', 'doctor1', 'patient1'].map((id) => (
                    <Button
                      key={id}
                      onClick={() => {
                        setTestUserId(id);
                        console.log("User ID set to:", id);
                        setStatus(`User ID set to: ${id}`);
                      }}
                      variant="outline"
                      size="sm"
                      className={testUserId === id ? "bg-blue-200 border-blue-500 text-blue-800" : "border-blue-300 hover:bg-blue-100"}
                    >
                      {id}
                    </Button>
                  ))}
                  <Button
                    onClick={() => {
                      const randomId = `user_${randomID(4)}`;
                      setTestUserId(randomId);
                      console.log("Generated random user ID:", randomId);
                      setStatus(`Random user ID generated: ${randomId}`);
                    }}
                    variant="outline"
                    size="sm"
                    className="border-blue-300 hover:bg-blue-100"
                  >
                    🎲 Random
                  </Button>
                </div>
              </div>
              
              <div className="bg-green-50 border border-green-200 p-3 rounded text-sm">
                <p className="font-medium text-green-800 mb-1">📱 Two-Device Testing Instructions:</p>
                <div className="text-green-700">
                  <p><strong>Device 1:</strong> Set User ID to <code className="bg-white px-1 rounded">user1</code> and start video call</p>
                  <p><strong>Device 2:</strong> Set User ID to <code className="bg-white px-1 rounded">user2</code> and start video call</p>
                  <p><em>Both devices will connect to the same channel and establish P2P connection automatically</em></p>
                </div>
              </div>
              
              <div className="text-sm text-gray-600">
                <p><strong>Current User:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{testUserId}</code></p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="w-6 h-6" />
              MiroTalk Video Call Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Test User ID:</p>
                <code className="bg-gray-100 px-2 py-1 rounded">{testUserId}</code>
              </div>
              
              <div>
                <p className="text-sm text-gray-600">Status:</p>
                <p className={`font-medium ${status.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {status}
                </p>
              </div>

              <div className="flex gap-4 flex-wrap">
                {!isVideoCall ? (
                  <Button 
                    onClick={startVideoCall}
                    disabled={isLoading || !browserSupported}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Video className="w-4 h-4 mr-2" />
                    {isLoading ? "Starting..." : !browserSupported ? "Browser Not Supported" : "Start Video Call"}
                  </Button>
                ) : (
                  <>
                    <Button 
                      onClick={endVideoCall}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      End Call
                    </Button>
                    
                    <Button
                      onClick={async () => {
                        console.log("🔊 Testing audio playback...");
                        
                        // Test local audio
                        if (localStream) {
                          const audioTracks = localStream.getAudioTracks();
                          console.log("🎤 Local audio tracks:", audioTracks.map(t => ({
                            label: t.label,
                            enabled: t.enabled,
                            muted: t.muted,
                            readyState: t.readyState
                          })));
                        }
                        
                        // Test remote audio
                        remoteStreams.forEach((stream, index) => {
                          const audioTracks = stream.getAudioTracks();
                          console.log(`🔊 Remote stream ${index} audio:`, audioTracks.map(t => ({
                            label: t.label,
                            enabled: t.enabled,
                            muted: t.muted,
                            readyState: t.readyState
                          })));
                          
                          // Try to play a test audio
                          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                          if (audioTracks.length > 0) {
                            const source = audioContext.createMediaStreamSource(stream);
                            const analyser = audioContext.createAnalyser();
                            source.connect(analyser);
                            
                            const dataArray = new Uint8Array(analyser.frequencyBinCount);
                            const checkAudio = () => {
                              analyser.getByteFrequencyData(dataArray);
                              const volume = dataArray.reduce((a, b) => a + b) / dataArray.length;
                              console.log(`🎵 Audio level for stream ${index}:`, volume);
                            };
                            
                            setInterval(checkAudio, 1000);
                          }
                        });
                        
                        setStatus("Audio test running - check console for details");
                      }}
                      variant="outline"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Test Audio
                    </Button>
                    
                    <Button 
                      onClick={async () => {
                        console.log("🚨 COMPREHENSIVE AUDIO DIAGNOSTIC STARTING...");
                        console.log("================================================");
                        
                        // Test 1: System audio capabilities
                        console.log("=== 1. SYSTEM AUDIO TEST ===");
                        try {
                          const devices = await navigator.mediaDevices.enumerateDevices();
                          const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                          console.log('🔊 Audio outputs:', audioOutputs.length);
                          audioOutputs.forEach((device, i) => {
                            console.log(`  Output ${i}:`, device.label || 'Unlabeled');
                          });
                          
                          if (audioOutputs.length === 0) {
                            console.error("❌ NO AUDIO OUTPUT DEVICES FOUND!");
                            setStatus("❌ No audio output devices detected");
                            return;
                          }
                          
                          // Test 2: AudioContext functionality
                          console.log("\n=== 2. AUDIO CONTEXT TEST ===");
                          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                          console.log('🎵 Initial AudioContext state:', audioContext.state);
                          console.log('🎵 Sample rate:', audioContext.sampleRate);
                          console.log('🎵 Destination channels:', audioContext.destination.channelCount);
                          
                          if (audioContext.state === 'suspended') {
                            await audioContext.resume();
                            console.log('✅ AudioContext resumed to:', audioContext.state);
                          }
                          
                          // Test 3: Play test tone directly to speakers
                          console.log("\n=== 3. DIRECT SPEAKER TEST ===");
                          const oscillator = audioContext.createOscillator();
                          const gainNode = audioContext.createGain();
                          oscillator.connect(gainNode);
                          gainNode.connect(audioContext.destination);
                          oscillator.frequency.value = 440;
                          gainNode.gain.value = 0.2;
                          oscillator.start();
                          console.log('🎵 Playing 440Hz test tone for 2 seconds...');
                          setTimeout(() => {
                            oscillator.stop();
                            console.log('✅ Test tone completed - did you hear it?');
                          }, 2000);
                          
                          await new Promise(resolve => setTimeout(resolve, 2500)); // Wait for tone
                          
                          // Test 4: Remote stream analysis
                          console.log("\n=== 4. REMOTE STREAM ANALYSIS ===");
                          if (remoteStreams.length === 0) {
                            console.log("⚠️ No remote streams available for testing");
                          } else {
                            remoteStreams.forEach((stream, index) => {
                              const audioTracks = stream.getAudioTracks();
                              const videoTracks = stream.getVideoTracks();
                              
                              console.log(`\nStream ${index} (${stream.id}):`);
                              console.log(`  Video tracks: ${videoTracks.length}`);
                              console.log(`  Audio tracks: ${audioTracks.length}`);
                              
                              audioTracks.forEach((track, trackIndex) => {
                                console.log(`  Audio track ${trackIndex}:`, {
                                  id: track.id,
                                  label: track.label,
                                  enabled: track.enabled,
                                  readyState: track.readyState,
                                  muted: track.muted
                                });
                              });
                              
                              // Test direct audio routing to speakers
                              if (audioTracks.length > 0 && audioContext.state === 'running') {
                                try {
                                  console.log(`\n=== 5. DIRECT STREAM ROUTING (Stream ${index}) ===`);
                                  const source = audioContext.createMediaStreamSource(stream);
                                  const analyser = audioContext.createAnalyser();
                                  const gainNode = audioContext.createGain();
                                  
                                  source.connect(analyser);
                                  analyser.connect(gainNode);
                                  gainNode.connect(audioContext.destination);
                                  
                                  gainNode.gain.value = 5.0; // 5x volume boost
                                  
                                  console.log(`🔀 Direct audio route created with 5x gain boost`);
                                  console.log(`🔊 Audio should now be VERY loud if working`);
                                  
                                  // Real-time audio monitoring
                                  const dataArray = new Uint8Array(analyser.frequencyBinCount);
                                  let monitorCount = 0;
                                  const monitor = () => {
                                    if (monitorCount++ > 20) return; // Monitor for 10 seconds
                                    
                                    analyser.getByteFrequencyData(dataArray);
                                    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                                    const max = Math.max(...Array.from(dataArray));
                                    
                                    if (average > 1 || max > 10) {
                                      console.log(`🔊 AUDIO DETECTED! Average: ${average.toFixed(2)}, Max: ${max} (5x boosted)`);
                                    } else {
                                      console.log(`🔇 Silent - Average: ${average.toFixed(2)}, Max: ${max}`);
                                    }
                                    
                                    setTimeout(monitor, 500);
                                  };
                                  monitor();
                                  
                                } catch (error) {
                                  console.error(`❌ Direct routing failed for stream ${index}:`, error);
                                }
                              }
                            });
                          }
                          
                          // Test 6: Audio elements
                          console.log("\n=== 6. HTML AUDIO ELEMENTS TEST ===");
                          const audioElements = document.querySelectorAll('audio');
                          console.log(`Found ${audioElements.length} audio elements`);
                          
                          audioElements.forEach((audio, index) => {
                            console.log(`\nAudio element ${index}:`, {
                              src: audio.src || 'MediaStream',
                              volume: audio.volume,
                              muted: audio.muted,
                              paused: audio.paused,
                              readyState: audio.readyState,
                              controls: audio.controls
                            });
                            
                            // Force maximum audio settings
                            audio.volume = 1.0;
                            audio.muted = false;
                            
                            audio.play().then(() => {
                              console.log(`✅ Audio element ${index} playing successfully`);
                            }).catch(e => {
                              console.log(`❌ Audio element ${index} play failed:`, e.message);
                            });
                          });
                          
                          console.log("\n================================================");
                          console.log("🚨 DIAGNOSTIC COMPLETE - CHECK ABOVE RESULTS");
                          console.log("Key things to check:");
                          console.log("1. Did you hear the test tone? (440Hz beep)");
                          console.log("2. Are there 'AUDIO DETECTED!' messages?");
                          console.log("3. Are audio elements playing successfully?");
                          console.log("4. Check browser volume mixer settings");
                          console.log("================================================");
                          
                          setStatus("🔊 Full audio diagnostic complete - check console for detailed results");
                          
                        } catch (error) {
                          console.error("❌ Audio diagnostic failed:", error);
                          setStatus(`❌ Audio diagnostic failed: ${error.message}`);
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="mt-2 bg-red-600 hover:bg-red-700 text-white font-bold"
                    >
                      🚨 FULL AUDIO DIAGNOSTIC
                    </Button>
                    
                    <Button 
                      onClick={async () => {
                        console.log("🔧 MANUAL AUDIO FORCE ATTEMPT");
                        
                        // Force user interaction to bypass autoplay policy
                        const userClickPromise = new Promise<void>((resolve) => {
                          const overlay = document.createElement('div');
                          overlay.style.position = 'fixed';
                          overlay.style.top = '0';
                          overlay.style.left = '0';
                          overlay.style.width = '100%';
                          overlay.style.height = '100%';
                          overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
                          overlay.style.color = 'white';
                          overlay.style.display = 'flex';
                          overlay.style.alignItems = 'center';
                          overlay.style.justifyContent = 'center';
                          overlay.style.zIndex = '9999';
                          overlay.style.fontSize = '24px';
                          overlay.style.cursor = 'pointer';
                          overlay.innerHTML = '<div>CLICK ANYWHERE TO ACTIVATE AUDIO<br/><small>This bypasses browser autoplay restrictions</small></div>';
                          
                          overlay.onclick = () => {
                            document.body.removeChild(overlay);
                            resolve();
                          };
                          
                          document.body.appendChild(overlay);
                        });
                        
                        await userClickPromise;
                        console.log("✅ User interaction received");
                        
                        // Now aggressively try to play all audio
                        const audioElements = document.querySelectorAll('audio, video');
                        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                        
                        if (audioContext.state !== 'running') {
                          await audioContext.resume();
                          console.log('🎵 AudioContext resumed after user interaction');
                        }
                        
                        // Force play all elements
                        audioElements.forEach(async (element, index) => {
                          const mediaElement = element as HTMLMediaElement;
                          mediaElement.muted = false;
                          mediaElement.volume = 1.0;
                          
                          try {
                            await mediaElement.play();
                            console.log(`✅ Force played element ${index} (${element.tagName})`);
                          } catch (error) {
                            console.log(`❌ Force play failed for element ${index}:`, error);
                          }
                        });
                        
                        setStatus("🔧 Manual audio activation attempted");
                      }}
                      variant="outline"
                      size="sm"
                      className="mt-2 bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      🔧 FORCE AUDIO ACTIVATION
                    </Button>
                  </>
                )}
              </div>

              {/* Audio Debug Info */}
              {isVideoCall && (
                <div className="mt-4 p-3 bg-gray-100 rounded text-sm">
                  <p className="font-medium">Audio Debug Info:</p>
                  {localStream && (
                    <p>Local Audio Tracks: {localStream.getAudioTracks().length} 
                       {localStream.getAudioTracks().map((track, i) => 
                         ` (${i}: ${track.enabled ? 'enabled' : 'disabled'})`
                       )}
                    </p>
                  )}
                  {remoteStreams.length > 0 && (
                    <p>Remote Audio Tracks: {remoteStreams[0]?.getAudioTracks().length}
                       {remoteStreams[0]?.getAudioTracks().map((track, i) => 
                         ` (${i}: ${track.enabled ? 'enabled' : 'disabled'})`
                       )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Video Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Local Video */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Local Video (You)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
                {localStream ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-white">
                    <div className="text-center">
                      <VideoOff className="w-16 h-16 mx-auto mb-2 opacity-50" />
                      <p>No local video</p>
                    </div>
                  </div>
                )}
                
                {localStream && (
                  <div className="absolute bottom-4 left-4">
                    <div className="bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                      Local
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Remote Video */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Remote Video</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
                {remoteStreams.length > 0 ? (
                  remoteStreams.map((stream, index) => (
                    <div key={index} className="relative w-full h-full">
                      <video
                        autoPlay
                        playsInline
                        controls={true}
                        muted={false}
                        className="w-full h-full object-cover"
                        ref={async (el) => {
                          if (el && stream) {
                            console.log(`🎬 Setting up remote video ${index}`);
                            
                            try {
                              // Set the stream
                              el.srcObject = stream;
                              el.volume = 1.0;
                              
                              // Force audio unmuted
                              el.muted = false;
                              
                              // Log track info
                              const audioTracks = stream.getAudioTracks();
                              const videoTracks = stream.getVideoTracks();
                              console.log(`� Stream ${index}: ${videoTracks.length} video, ${audioTracks.length} audio tracks`);
                              
                              // Enable all tracks
                              [...audioTracks, ...videoTracks].forEach((track, trackIndex) => {
                                track.enabled = true;
                                console.log(`🔊 Track ${trackIndex} (${track.kind}): ${track.enabled ? 'enabled' : 'disabled'}`);
                              });
                              
                              // Wait for metadata and try to play
                              el.onloadedmetadata = async () => {
                                console.log(`📺 Metadata loaded for stream ${index}`);
                                try {
                                  await el.play();
                                  console.log(`✅ Video ${index} playing`);
                                  
                                  // Double-check audio settings
                                  el.muted = false;
                                  el.volume = 1.0;
                                  console.log(`🔊 Final audio settings - muted: ${el.muted}, volume: ${el.volume}`);
                                  
                                } catch (playError) {
                                  console.error(`❌ Play failed for video ${index}:`, playError);
                                  
                                  // Try user interaction workaround
                                  const tryPlay = async () => {
                                    try {
                                      await el.play();
                                      el.muted = false;
                                      console.log(`✅ Video ${index} playing after user interaction`);
                                    } catch (e) {
                                      console.error(`❌ Still failed to play video ${index}:`, e);
                                    }
                                  };
                                  
                                  // Add click listener to try playing on user interaction
                                  document.addEventListener('click', tryPlay, { once: true });
                                  setStatus(`Click anywhere to enable audio for video ${index}`);
                                }
                              };
                              
                            } catch (error) {
                              console.error(`❌ Error setting up video ${index}:`, error);
                            }
                          }
                        }}
                      />
                      
                      {/* Audio debug overlay */}
                      <div className="absolute top-2 left-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-xs">
                        Stream {index}: {stream.getAudioTracks().length}🎵 {stream.getVideoTracks().length}📹
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full text-white">
                    <div className="text-center">
                      <VideoOff className="w-16 h-16 mx-auto mb-2 opacity-50" />
                      <p>No remote video</p>
                      {isVideoCall && (
                        <p className="text-sm opacity-75 mt-2">
                          Waiting for other participants...
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {remoteStreams.length > 0 && (
                  <div className="absolute bottom-4 left-4">
                    <div className="bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                      Remote
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audio Elements for better audio handling */}
        {remoteStreams.map((stream, index) => (
          <div key={`audio-container-${stream.id}`}>
            <audio 
              key={`audio-${stream.id}`}
              ref={remoteAudioRef}
              autoPlay={true}
              controls={true}
              muted={false}
              style={{ display: 'block', marginBottom: '10px' }}
              onLoadedMetadata={async () => {
                console.log(`🎵 Audio element ${index} loaded metadata`);
                const audio = remoteAudioRef.current;
                if (audio) {
                  audio.srcObject = stream;
                  audio.volume = 1.0;
                  
                  // Force audio context resume
                  if (window.AudioContext || (window as any).webkitAudioContext) {
                    try {
                      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                      if (audioContext.state === 'suspended') {
                        await audioContext.resume();
                        console.log('🎵 Audio context resumed');
                      }
                      
                      // Create audio analysis
                      if (stream.getAudioTracks().length > 0) {
                        const source = audioContext.createMediaStreamSource(stream);
                        const analyser = audioContext.createAnalyser();
                        const gainNode = audioContext.createGain();
                        
                        source.connect(analyser);
                        analyser.connect(gainNode);
                        gainNode.connect(audioContext.destination);
                        
                        gainNode.gain.value = 2.0; // Boost volume
                        
                        const dataArray = new Uint8Array(analyser.frequencyBinCount);
                        const checkAudio = () => {
                          analyser.getByteFrequencyData(dataArray);
                          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                          console.log(`🔊 Direct audio context volume: ${average.toFixed(2)}`);
                        };
                        
                        setInterval(checkAudio, 1000);
                        console.log('🎵 Audio analysis connected with gain boost');
                      }
                    } catch (error) {
                      console.error('🎵 Audio context error:', error);
                    }
                  }
                  
                  try {
                    await audio.play();
                    console.log(`✅ Audio element ${index} playing successfully`);
                  } catch (e) {
                    console.log(`❌ Audio play error ${index}:`, e);
                  }
                }
              }}
              onCanPlay={async () => {
                console.log(`🎵 Audio ${index} can play`);
                const audio = remoteAudioRef.current;
                if (audio) {
                  audio.muted = false;
                  audio.volume = 1.0;
                  try {
                    await audio.play();
                  } catch (e) {
                    console.log('🎵 Play on canplay failed:', e);
                  }
                }
              }}
              onVolumeChange={() => {
                const audio = remoteAudioRef.current;
                if (audio) {
                  console.log(`🔊 Volume changed to: ${audio.volume}, muted: ${audio.muted}`);
                }
              }}
            />
            <p className="text-sm text-gray-600">Audio Element {index + 1} (Should be audible)</p>
          </div>
        ))}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Testing Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>1.</strong> Click "Start Video Call" to begin (will ask for camera/mic permissions)</p>
              <p><strong>2.</strong> Your local video should appear in the left panel</p>
              <p><strong>3.</strong> To test P2P connection: Open this same URL in another browser tab/window</p>
              <p><strong>4.</strong> Start a video call in the second tab - both should connect via WebRTC</p>
              <p><strong>5.</strong> Check browser console (F12) for detailed logging</p>
              <p><strong>6.</strong> Check backend terminal for socket event logs</p>
            </div>
          </CardContent>
        </Card>

        {/* Troubleshooting */}
        {(!browserSupported || status.includes('⚠️')) && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="text-lg text-red-800">
                {!browserSupported ? 'Browser Compatibility Issues' : 'Camera Access Warning'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="font-medium text-red-700">Solutions for Camera Access on LAN:</div>
                
                {/* Chrome Solutions */}
                <div className="bg-white p-3 rounded border">
                  <p className="font-semibold text-blue-700">🔵 For Chrome:</p>
                  <div className="mt-2 space-y-1">
                    <p><strong>Method 1:</strong> Go to <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code></p>
                    <p>Add: <code>http://192.168.1.72:4000</code> then restart Chrome</p>
                    <p><strong>Method 2:</strong> Start Chrome with flag:</p>
                    <code className="block bg-gray-100 p-2 rounded text-xs">
                      google-chrome --unsafely-treat-insecure-origin-as-secure=http://192.168.1.72:4000 --user-data-dir=/tmp/chrome_test
                    </code>
                  </div>
                </div>

                {/* Firefox Solutions */}
                <div className="bg-white p-3 rounded border">
                  <p className="font-semibold text-orange-700">🟠 For Firefox:</p>
                  <div className="mt-2 space-y-1">
                    <p>1. Go to <code>about:config</code></p>
                    <p>2. Set <code>media.devices.insecure.enabled</code> to <strong>true</strong></p>
                    <p>3. Set <code>media.getusermedia.insecure.enabled</code> to <strong>true</strong></p>
                    <p>4. Restart Firefox</p>
                  </div>
                </div>

                {/* Alternative Solutions */}
                <div className="bg-white p-3 rounded border">
                  <p className="font-semibold text-green-700">🟢 Alternative Solutions:</p>
                  <div className="mt-2 space-y-1">
                    <p><strong>1. Use localhost:</strong> Test on the same machine with <code>http://localhost:4000/video-test</code></p>
                    <p><strong>2. Set up HTTPS:</strong> Use SSL certificates for secure access</p>
                    <p><strong>3. Use tunneling:</strong> Tools like ngrok to create HTTPS tunnel</p>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-yellow-100 rounded border border-yellow-300">
                  <p className="font-medium text-yellow-800">Current Environment:</p>
                  <p>URL: {window.location.href}</p>
                  <p>Protocol: {window.location.protocol}</p>
                  <p>Hostname: {window.location.hostname}</p>
                  <p>Secure Context: {window.isSecureContext ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VideoCallTestSimple;