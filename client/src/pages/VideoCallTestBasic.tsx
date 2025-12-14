import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Phone } from "lucide-react";
import { randomID } from "@/lib/utils";
import io, { Socket } from "socket.io-client";

const VideoCallTestBasic = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [testUserId] = useState(() => {
    const id = `test_user_${randomID(6)}`;
    console.log("Generated test user ID:", id);
    return id;
  });
  const [socket, setSocket] = useState<typeof Socket | null>(null);
  const [status, setStatus] = useState("Checking connection...");
  const [messages, setMessages] = useState<string[]>([]);

  const addMessage = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages(prev => [...prev, `[${timestamp}] ${msg}`]);
    console.log(msg);
  };

  // Initialize socket connection for testing
  useEffect(() => {
    const backendUrl = `http://${window.location.hostname}:8000`;
    console.log("🔌 Connecting to backend:", backendUrl);
    addMessage(`Connecting to: ${backendUrl}`);
    
    const testSocket = io(backendUrl, {
      query: {
        userId: testUserId,
        userType: "user",
      },
      timeout: 20000,
      transports: ['websocket', 'polling']
    });
    
    setSocket(testSocket);

    // Connection events
    testSocket.on("connect", () => {
      console.log("✅ Socket connected successfully");
      setStatus("✅ Socket connected - basic connection working");
      setIsConnected(true);
      addMessage("✅ Socket connected successfully!");
    });

    testSocket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
      setStatus(`❌ Socket connection failed: ${error.message}`);
      setIsConnected(false);
      addMessage(`❌ Connection error: ${error.message}`);
    });

    testSocket.on("disconnect", (reason) => {
      console.log("🔌 Socket disconnected:", reason);
      setStatus("🔌 Socket disconnected");
      setIsConnected(false);
      addMessage(`🔌 Disconnected: ${reason}`);
    });

    // Test event listeners
    testSocket.on("test-message", (data) => {
      addMessage(`📨 Received test message: ${JSON.stringify(data)}`);
    });

    testSocket.on("mirotalk-join", (data) => {
      addMessage(`🚪 Someone joined: ${JSON.stringify(data)}`);
    });

    return () => {
      testSocket.disconnect();
    };
  }, [testUserId]);

  const testSocketConnection = () => {
    if (!socket) {
      addMessage("❌ No socket connection");
      return;
    }

    const channelName = `test_channel_${randomID(6)}`;
    addMessage(`🧪 Testing socket events in channel: ${channelName}`);
    
    // Test basic socket communication
    socket.emit("mirotalk-join", { 
      channel: channelName, 
      uid: testUserId 
    });
    
    addMessage("📤 Sent join event to server");
    
    // Send test message
    setTimeout(() => {
      socket.emit("test-message", {
        message: "Hello from test client!",
        userId: testUserId,
        timestamp: Date.now()
      });
      addMessage("📤 Sent test message");
    }, 1000);
  };

  const checkBrowserCapabilities = () => {
    addMessage("🔍 Checking browser capabilities...");
    
    // Check WebRTC
    const hasWebRTC = !!(window as any).RTCPeerConnection || !!(window as any).webkitRTCPeerConnection;
    addMessage(`🔗 WebRTC support: ${hasWebRTC ? '✅ Yes' : '❌ No'}`);
    
    // Check getUserMedia
    const hasGetUserMedia = !!(navigator.mediaDevices?.getUserMedia) || 
      !!((navigator as any).getUserMedia || (navigator as any).webkitGetUserMedia);
    addMessage(`📷 getUserMedia support: ${hasGetUserMedia ? '✅ Yes' : '❌ No'}`);
    
    // Check secure context
    const isSecure = window.isSecureContext;
    addMessage(`🔒 Secure context: ${isSecure ? '✅ Yes' : '❌ No'}`);
    
    // Environment info
    addMessage(`🌐 URL: ${window.location.href}`);
    addMessage(`🔗 Protocol: ${window.location.protocol}`);
    addMessage(`🏠 Hostname: ${window.location.hostname}`);
    addMessage(`🖥️ User Agent: ${navigator.userAgent.substring(0, 80)}...`);
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="w-6 h-6" />
              Basic Connection Test (No Camera Required)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Test User ID:</p>
                <code className="bg-gray-100 px-2 py-1 rounded">{testUserId}</code>
              </div>
              
              <div>
                <p className="text-sm text-gray-600">Connection Status:</p>
                <p className={`font-medium ${status.includes('❌') ? 'text-red-600' : isConnected ? 'text-green-600' : 'text-yellow-600'}`}>
                  {status}
                </p>
              </div>

              <div className="flex gap-4 flex-wrap">
                <Button 
                  onClick={testSocketConnection}
                  disabled={!isConnected}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Test Socket Events
                </Button>
                
                <Button 
                  onClick={checkBrowserCapabilities}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Video className="w-4 h-4 mr-2" />
                  Check Browser Support
                </Button>
                
                <Button 
                  onClick={clearMessages}
                  variant="outline"
                >
                  Clear Log
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Message Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Test Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-black text-green-400 p-4 rounded font-mono text-sm max-h-96 overflow-y-auto">
              {messages.length === 0 ? (
                <p>No messages yet. Click buttons above to run tests.</p>
              ) : (
                messages.map((msg, index) => (
                  <div key={index} className="mb-1">
                    {msg}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Testing Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>1.</strong> First check if socket connection works (should show "Socket connected")</p>
              <p><strong>2.</strong> Click "Test Socket Events" to verify backend communication</p>
              <p><strong>3.</strong> Click "Check Browser Support" to see what's blocking camera access</p>
              <p><strong>4.</strong> If all tests pass, the issue is only camera permissions, not WebRTC</p>
              <p><strong>5.</strong> Open this same page on both devices to test cross-device communication</p>
            </div>
          </CardContent>
        </Card>

        {/* Connection Info */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg text-blue-800">Access URLs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>This machine:</strong> <code>http://localhost:4000/video-test-basic</code></p>
              <p><strong>Other devices:</strong> <code>http://192.168.1.72:4000/video-test-basic</code></p>
              <p><strong>Backend API:</strong> <code>http://192.168.1.72:8000</code></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VideoCallTestBasic;