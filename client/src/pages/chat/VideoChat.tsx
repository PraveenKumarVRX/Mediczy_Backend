import { useState, useEffect, useRef } from "react";
import MainLayout from "@/components/layout/MainLayout";
import MainLayoutdoctor from "@/components/layout/MainLayoutdoctor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, Video, VideoOff, Send, UserCheck, User2, Loader2, Mic, MicOff, PhoneOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/utils/api";
import { doctorProfileProps, UserProps } from "@/lib/user.type";
import { randomID } from "@/lib/utils";
import { useSocket } from "@/context/SocketContext";
import useLiveKit from "@/hooks/useLiveKit";

// Define types
interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  isOnline: boolean;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  specialization: string;
  isOnline: boolean;
}

interface Message {
  _id: string;
  text: string;
  sender: {
    id: string;
    type: "user" | "doctor";
  };
  receiver: {
    id: string;
    type: "user" | "doctor";
  };
  read: boolean;
  createdAt: string;
}

interface Conversation {
  _id: string;
  participants: {
    id: string;
    model: string;
    unreadCount: number;
  }[];
  lastMessage: {
    text: string;
    sender: string;
    timestamp: string;
  };
  messages: Message[];
}

type Recipient = (User | Doctor) & { _id: string };

const normalizeParticipants = (payload: any): Recipient[] => {
  const rawList = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];

  return rawList
    .filter(Boolean)
    .map((item: any) => {
      const normalizedId = item._id || item.id || item.userId;
      return {
        ...item,
        _id: normalizedId ? String(normalizedId) : "",
        isOnline: Boolean(item.isOnline),
      } as Recipient;
    })
    .filter((item: Recipient) => Boolean(item._id));
};

const Chat = () => {
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const { currentUser, currentDoctor, userType, isLoading: authLoading } = useAuth();
  const [selectedRecipient, setSelectedRecipient] = useState<
    User | Doctor | null
  >(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const { toast } = useToast();
  const messageEndRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  // LiveKit hook for video calls
  const { 
    localStream, 
    remoteStreams, 
    isJoined, 
    isLoading, 
    joinChannel, 
    leaveChannel, 
    toggleVideo, 
    toggleAudio 
  } = useLiveKit();

  // Get recipient and instant flag from URL
  const searchParams = new URLSearchParams(window.location.search);
  const doctorIdFromUrl = searchParams.get('doctorId');
  const userIdFromUrl = searchParams.get('userId');
  const isInstantConsultation = searchParams.get('instant') === 'true';

  const recipientIdFromUrl = userType === 'doctor'
    ? (userIdFromUrl || doctorIdFromUrl) // backward compatible with older doctor links
    : doctorIdFromUrl;

  // Get current user ID and type
  const currentId = userType === "user" ? currentUser?._id : currentDoctor?._id;

  // Fetch available doctors/users depending on user type
  const { data: availableUsers = [] } = useQuery<Recipient[]>({
    queryKey: ["available-users", userType],
    queryFn: async () => {
      const response = await api.get(
        userType === "user" ? "/doctors/available" : "/users/available"
      );
      // Handle both response formats: {data: []} and {doctors: []} and {users: []}
      const payload = response.data;
      const participantsList = payload.data || payload.doctors || payload.users || payload;
      return normalizeParticipants(participantsList);
    },
    enabled: !!currentId,
  });

  // Auto-select recipient from URL if present
  useEffect(() => {
    if (recipientIdFromUrl && availableUsers.length) {
      const recipient = availableUsers.find((user) => user._id === recipientIdFromUrl);
      if (recipient) {
        setSelectedRecipient(recipient);
        
        // If it's an instant consultation (patient side), show welcome message
        if (userType === 'user' && isInstantConsultation && !messages.length) {
          const welcomeMessage: Message = {
            _id: randomID(10),
            text: `Hello! I'm Dr. ${recipient.firstName} ${recipient.lastName}. How can I help you today?`,
            sender: {
              id: recipient._id,
              type: "doctor" as const
            },
            receiver: {
              id: currentId || "",
              type: "user" as const
            },
            read: false,
            createdAt: new Date().toISOString()
          };
          setMessages([welcomeMessage]);
        }
      }
    }
  }, [recipientIdFromUrl, availableUsers, isInstantConsultation, userType, currentId, messages.length]);

  // Attach local stream to video element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteStreams.length > 0 && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreams[0].stream;
    }
  }, [remoteStreams]);

  // Initialize socket listeners
  useEffect(() => {
    if (!socket || !currentId) return;

    // Listen for new messages
    socket.on("new-message", (data) => {
      // If the message is for the current conversation, add it to messages
      if (
        currentConversation &&
        data.conversationId === currentConversation._id
      ) {
        setMessages((prev) => [...prev, data.message]);
      }

      // Update conversations list
      fetchConversations();
    });

    // Listen for message notifications
    socket.on("message-notification", (data) => {
      toast({
        title: "New Message",
        description: `You have a new message in conversation ${
          userType === "user" ? "with Doctor" : "from User"
        }`,
      });
    });

    // Listen for user status changes
    socket.on("user-status-change", (data) => {
      // Update user status in the list
      queryClient.invalidateQueries({ queryKey: ["available-users"] });
      
      // Update selected recipient status if it matches
      if (selectedRecipient && selectedRecipient._id === data.userId) {
        setSelectedRecipient((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            isOnline: data.isOnline
          };
        });
      }
    });

    return () => {
      socket.off("new-message");
      socket.off("message-notification");
      socket.off("user-status-change");
    };
  }, [socket, currentId, currentConversation, selectedRecipient]);

  // Fetch user conversations
  const fetchConversations = () => {
    if (!socket || !currentId) return;

    socket.emit("get-conversations", { userId: currentId });
    socket.on("user-conversations", (data) => {
      setConversations(data.conversations);
    });
  };

  // Fetch conversations on component mount
  useEffect(() => {
    if (socket) {
      fetchConversations();
    }
  }, [socket]);

  // Fetch chat history when a recipient is selected
  useEffect(() => {
    if (!socket || !selectedRecipient || !currentId) return;

    // Find existing conversation or create new one
    const recipientId = selectedRecipient._id;
    const existingConversation = conversations.find((conv) =>
      conv.participants.some((p) => p.id === recipientId)
    );

    if (existingConversation) {
      setCurrentConversation(existingConversation);

      // Fetch messages for this conversation
      socket.emit("get-chat-history", {
        conversationId: existingConversation._id,
      });

      socket.on("chat-history", (data) => {
        if (data.conversationId === existingConversation._id) {
          setMessages(data.messages);

          // Mark messages as read
          socket.emit("mark-messages-read", {
            conversationId: existingConversation._id,
            userId: currentId,
          });
        }
      });
    } else {
      setCurrentConversation(null);
      setMessages([]);
    }

    return () => {
      socket.off("chat-history");
    };
  }, [selectedRecipient, currentId, conversations, socket]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message handler
  const handleSendMessage = () => {
    if (!socket || !newMessage.trim() || !selectedRecipient || !currentId) return;

    const recipientId = selectedRecipient._id;
    const recipientType = userType === "user" ? "doctor" : "user";

    // Prepare message data
    const messageData = {
      senderId: currentId,
      receiverId: recipientId,
      text: newMessage,
      senderType: userType,
      receiverType: recipientType,
    };

    // Send message via socket
    socket.emit("send-message", messageData);

    // Clear input
    setNewMessage("");
  };

  // Start video call using LiveKit
  const startVideoCall = async () => {
    if (!selectedRecipient || !currentId) return;

    const roomID = `mediczy_${currentId}_${selectedRecipient._id}_${randomID(5)}`;

    try {
      await joinChannel(roomID, currentId);
      setIsVideoCall(true);

      // Notify the recipient about the incoming call via socket
      if (socket) {
        socket.emit("video-call-request", {
          callerId: currentId,
          callerName: currentDoctor
            ? `${currentDoctor.firstName} ${currentDoctor.lastName}`
            : `${currentUser?.firstName} ${currentUser?.lastName}`,
          recipientId: selectedRecipient._id,
          roomId: roomID,
        });
      }

      toast({
        title: "Starting video call",
        description: `Connecting to ${getRecipientName(selectedRecipient)}...`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start video call. Please check camera/microphone permissions.",
        variant: "destructive",
      });
    }
  };

  // Handle toggle mute
  const handleToggleMute = () => {
    toggleAudio();
    setIsMuted(!isMuted);
  };

  // Handle toggle video
  const handleToggleVideo = () => {
    toggleVideo();
    setIsVideoEnabled(!isVideoEnabled);
  };

  // Start audio call (placeholder - uses same LiveKit with video off)
  const startAudioCall = async () => {
    if (!selectedRecipient || !currentId) return;
    
    const roomID = `mediczy_audio_${currentId}_${selectedRecipient._id}_${randomID(5)}`;
    
    try {
      await joinChannel(roomID, currentId);
      setIsVideoCall(true);
      setIsVideoEnabled(false);
      toggleVideo(); // Turn off video for audio-only call
      
      toast({
        title: "Starting audio call",
        description: `Connecting to ${getRecipientName(selectedRecipient)}...`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start audio call. Please check microphone permissions.",
        variant: "destructive",
      });
    }
  };

  // End video call
  const endVideoCall = () => {
    leaveChannel();
    setIsVideoCall(false);
    setIsMuted(false);
    setIsVideoEnabled(true);
    toast({
      title: "Call ended",
      description: "The call has ended",
    });
  };

  // Helper function to get recipient name
  const getRecipientName = (recipient: User | Doctor) => {
    return `${recipient.firstName} ${recipient.lastName}`;
  };

  const Layout = userType === "doctor" ? MainLayoutdoctor : MainLayout;
  const visibleRecipients = userType === "doctor"
    ? availableUsers.filter((recipient) => !("specialization" in recipient))
    : availableUsers.filter((recipient) => "specialization" in recipient);

  // Show loading while auth is checking
  if (authLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Show login prompt if not authenticated
  if (!currentUser && !currentDoctor) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="p-8 text-center max-w-md">
            <User2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Login Required</h2>
            <p className="text-muted-foreground mb-4">
              Please login to access the chat with doctor feature.
            </p>
            <Button asChild>
              <a href="/login">Login to Continue</a>
            </Button>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto animate-in">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">
            {userType === "doctor"
              ? "Chat with Patients"
              : (isInstantConsultation ? "Instant Consultation" : "Chat with Doctor")}
          </h1>
          {selectedRecipient && (
            <div className="flex items-center gap-2">
              <Badge variant={selectedRecipient.isOnline ? "default" : "secondary"}>
                {selectedRecipient.isOnline ? "Online" : "Offline"}
              </Badge>
              {isInstantConsultation && (
                <Badge variant="default">Instant Consultation</Badge>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-[300px_1fr]">
          {/* Available Users/Doctors List */}
          <Card className="h-[calc(100vh-200px)]">
            <CardHeader>
              <CardTitle>
                Available {userType === "user" ? "Doctors" : "Users"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                {/* Show available conversations */}
                {conversations.length > 0 && (
                  <div className="mb-4">
                    <h3 className="p-2 text-sm font-medium text-muted-foreground">
                      Recent Conversations
                    </h3>
                    {conversations.map((conversation) => {
                      // Find the other participant
                      const otherParticipant = conversation.participants.find(
                        (p) => p.id !== currentId
                      );

                      // Find full user/doctor data from available users
                      const recipientData = availableUsers.find(
                        (u: UserProps | doctorProfileProps) =>
                          u._id === otherParticipant?.id
                      );

                      if (!recipientData) return null;

                      return (
                        <div
                          key={conversation._id}
                          className={`flex cursor-pointer items-center gap-3 border-b p-4 transition-colors hover:bg-accent ${
                            selectedRecipient?._id === recipientData._id
                              ? "bg-accent"
                              : ""
                          }`}
                          onClick={() => setSelectedRecipient(recipientData)}
                        >
                          <div className="relative">
                            <Avatar className="h-10 w-10">
                              <AvatarImage
                                src={`https://i.pravatar.cc/150?img=${recipientData._id}`}
                              />
                              <AvatarFallback>
                                {recipientData.firstName[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                                recipientData.isOnline
                                  ? "bg-green-500"
                                  : "bg-zinc-500"
                              }`}
                            />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">
                              {recipientData.firstName +
                                " " +
                                recipientData.lastName}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {conversation.lastMessage?.text ||
                                "No messages yet"}
                            </p>
                          </div>
                          {otherParticipant?.unreadCount > 0 && (
                            <Badge variant="destructive">
                              {otherParticipant.unreadCount}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Show available users/doctors */}
                <h3 className="p-2 text-sm font-medium text-muted-foreground">
                  All {userType === "user" ? "Doctors" : "Users"}
                </h3>
                {visibleRecipients.map((recipient) => (
    <div
      key={recipient._id}
      className={`flex cursor-pointer items-center gap-3 border-b p-4 transition-colors hover:bg-accent ${
        selectedRecipient?._id === recipient._id ? "bg-accent" : ""
      }`}
      onClick={() => setSelectedRecipient({ 
        ...recipient, 
        _id: recipient._id, 
        isOnline: recipient.isOnline 
      })}
    >
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={`https://i.pravatar.cc/150?img=${recipient._id}`} />
          <AvatarFallback>{recipient.firstName[0]}</AvatarFallback>
        </Avatar>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
            recipient.isOnline ? "bg-green-500" : "bg-zinc-500"
          }`}
        />
      </div>
      <div className="flex-1">
        <p className="font-medium">
          {recipient.firstName + " " + recipient.lastName}
        </p>
        {"specialization" in recipient && (
          <p className="text-sm text-muted-foreground">
            {recipient.specialization}
          </p>
        )}
      </div>
      <Badge variant={recipient.isOnline ? "default" : "secondary"}>
        {recipient.isOnline ? "active" : "offline"}
      </Badge>
    </div>
  ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="h-[calc(100vh-200px)]">
            {selectedRecipient ? (
              <>
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage
                          src={`https://i.pravatar.cc/150?img=${selectedRecipient._id}`}
                        />
                        <AvatarFallback>
                          {selectedRecipient.firstName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle>
                          {getRecipientName(selectedRecipient)}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {userType === "user" &&
                          "specialization" in selectedRecipient
                            ? selectedRecipient.specialization
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={startAudioCall}
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={startVideoCall}
                      >
                        <Video className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex h-[calc(100%-160px)] flex-col justify-between p-0">
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.map((message) => (
                        <div
                          key={message._id}
                          className={`flex ${
                            message.sender.id === currentId
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`rounded-lg px-4 py-2 max-w-[80%] ${
                              message.sender.id === currentId
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <div
                              className={`flex gap-2 items-center ${
                                message.sender.id === currentId
                                  ? "flex-row-reverse"
                                  : ""
                              }`}
                            >
                              {message.sender.id === currentId ? (
                                <UserCheck size={15} />
                              ) : (
                                <User2 size={15} />
                              )}

                              <p className="break-words">{message.text}</p>
                            </div>
                            <p className="mt-1 text-xs opacity-70">
                              {new Date(message.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={messageEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="border-t p-4">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSendMessage();
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-1"
                      />
                      <Button type="submit" className="flex-shrink-0">
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <User2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p>
                    {isInstantConsultation 
                      ? "Connecting you with the doctor..."
                      : `Select a ${userType === "user" ? "doctor" : "user"} to start chatting`}
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Video Call Dialog */}
        <Dialog
          open={isVideoCall}
          onOpenChange={(open) => !open && endVideoCall()}
        >
          <DialogContent className="h-[80vh] max-w-4xl p-0 overflow-hidden">
            <DialogHeader className="p-4 border-b">
              <DialogTitle className="flex items-center justify-between">
                <span>
                  {isVideoEnabled ? "Video" : "Audio"} Call with{" "}
                  {selectedRecipient ? getRecipientName(selectedRecipient) : ""}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="h-full w-full bg-black relative flex flex-col">
              {/* Video Container */}
              <div className="flex-1 relative">
                {/* Remote Video (large) */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                
                {/* Local Video (small overlay) */}
                <div className="absolute bottom-4 right-4 w-32 h-24 bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Loading indicator */}
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-center text-white">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                      <p>Connecting...</p>
                    </div>
                  </div>
                )}
                
                {/* No remote stream indicator */}
                {!isLoading && remoteStreams.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white">
                      <User2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p>Waiting for {selectedRecipient ? getRecipientName(selectedRecipient) : "participant"} to join...</p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Call Controls */}
              <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4">
                <Button
                  variant={isMuted ? "destructive" : "secondary"}
                  size="icon"
                  onClick={handleToggleMute}
                  className="rounded-full h-12 w-12"
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={endVideoCall}
                  className="rounded-full h-14 w-14"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <Button
                  variant={isVideoEnabled ? "secondary" : "destructive"}
                  size="icon"
                  onClick={handleToggleVideo}
                  className="rounded-full h-12 w-12"
                >
                  {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Chat;
