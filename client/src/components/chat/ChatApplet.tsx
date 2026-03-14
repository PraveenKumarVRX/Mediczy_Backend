// ChatApplet v2.0 - Enhanced with multi-role support
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { 
  MessageCircle, 
  Send, 
  X, 
  Minimize2, 
  Users, 
  HeadphonesIcon,
  UserCheck,
  ChevronDown,
  Circle,
  Paperclip,
  Download,
  File,
  Image as ImageIcon,
  Loader2,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/utils/api';
import { MalwareWarningDialog, parseMalwareError } from '@/components/MalwareWarningDialog';

interface Message {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  userRole: string;
  message: string;
  type: 'text' | 'file' | 'image';
  timestamp: string;
  edited: boolean;
  reactions: any[];
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isOnline: boolean;
  lastSeen?: string;
  avatar?: string;
}

interface ChatRoom {
  id: string;
  type: 'user_team' | 'team_internal';
  participants: string[];
  title: string;
  description: string;
  lastActivity?: string;
  lastMessage?: {
    content: string;
    sender: string;
    timestamp: string;
  };
}

const ChatApplet = () => {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Check access on mount
    const userType = localStorage.getItem('userType');
    const adminToken = localStorage.getItem('adminToken');
    const teamToken = localStorage.getItem('teamToken');
    
    // Only show for explicit admin or team users with valid tokens
    const hasAccess = (userType === 'admin' || userType === 'team') && !!(adminToken || teamToken);
    setShouldRender(hasAccess);
  }, []);

  // Don't render anything if user doesn't have access
  if (!shouldRender) {
    return null;
  }

  return <ChatAppletContent />;
};

const ChatAppletContent = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [malwareWarning, setMalwareWarning] = useState<{ open: boolean; threat?: string; fileName?: string }>({ open: false });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Get user info from localStorage or context
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    // Get user info from localStorage
    const adminData = localStorage.getItem('adminData');
    const teamUserData = localStorage.getItem('teamUserData');
    const userData = localStorage.getItem('userData');
    const nurseData = localStorage.getItem('nurseData');
    const assistantData = localStorage.getItem('assistantData');
    const doctorData = localStorage.getItem('doctorData');
    
    if (adminData) {
      setUserInfo(JSON.parse(adminData));
    } else if (teamUserData) {
      setUserInfo(JSON.parse(teamUserData));
    } else if (userData) {
      setUserInfo(JSON.parse(userData));
    } else if (nurseData) {
      setUserInfo(JSON.parse(nurseData));
    } else if (assistantData) {
      setUserInfo(JSON.parse(assistantData));
    } else if (doctorData) {
      setUserInfo(JSON.parse(doctorData));
    }
  }, []);

  useEffect(() => {
    if (userInfo && isOpen) {
      loadChatRooms();
      fetchTeamMembers();
    }
  }, [userInfo, isOpen]);

  useEffect(() => {
    if (activeRoom) {
      loadMessages(activeRoom);
    }
  }, [activeRoom]);

  useEffect(() => {
    // Fetch team members when switching to team tab
    if (activeTab === 'team' && userInfo && isOpen) {
      fetchTeamMembers();
    }
  }, [activeTab]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeRoom]);

  // Check if user has proper authentication for chat
  const hasChatAccess = () => {
    const adminToken = localStorage.getItem('adminToken');
    const teamToken = localStorage.getItem('teamToken');
    const userType = localStorage.getItem('userType');
    const userData = localStorage.getItem('userData');
    const nurseData = localStorage.getItem('nurseData');
    const assistantData = localStorage.getItem('assistantData');
    
    // Block regular users/patients from accessing chat
    if (userData && !adminToken && !teamToken) {
      return false;
    }
    
    // Only allow for admin, team, nurse, and assistant users
    return (userType === 'admin' || userType === 'team' || nurseData || assistantData) && !!(adminToken || teamToken);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatRooms = async () => {
    if (!hasChatAccess()) {
      console.log('Chat access denied - not authenticated as team/admin user');
      return;
    }

    try {
      const response = await api.get('/chat/rooms');
      const data = response.data;
      if (data.success) {
        setRooms(data.rooms);
        if (data.rooms.length > 0 && !activeRoom) {
          setActiveRoom(data.rooms[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading chat rooms:', error);
    }
  };

  const loadMessages = async (roomId: string) => {
    if (!hasChatAccess()) {
      console.log('Chat access denied - not authenticated as team/admin user');
      return;
    }

    try {
      setLoading(true);
      const response = await api.get(`/chat/rooms/${roomId}/messages`, {
        params: { limit: 50 },
      });
      const data = response.data;
      if (data.success) {
        setMessages(prev => ({
          ...prev,
          [roomId]: data.messages
        }));
        
        // Clear unread count for this room
        setUnreadCounts(prev => ({
          ...prev,
          [roomId]: 0
        }));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    if (!hasChatAccess()) {
      console.log('Chat access denied - not authenticated as team/admin user');
      return;
    }

    setLoading(true);
    try {
      console.log('Fetching team members');

      const response = await api.get('/chat/team-members');
      const data = response.data;
      console.log('Team members response:', data);
      
      if (data.success) {
        console.log('Setting team members:', data.members.length);
        setTeamMembers(data.members);
      } else {
        console.error('Failed to fetch team members:', data.message);
      }
    } catch (error) {
      console.error('Error loading team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const createDirectChat = async (member: TeamMember) => {
    if (!hasChatAccess()) {
      console.log('Chat access denied - not authenticated as team/admin user');
      return;
    }

    try {
      // Check if a direct chat room already exists with this member
      const existingRoom = rooms.find(room => 
        room.type === 'team_internal' && 
        room.title === `Chat with ${member.name}`
      );

      if (existingRoom) {
        // Switch to existing room
        setActiveRoom(existingRoom.id);
        setActiveTab('chat');
        return;
      }

      // Create a new direct chat room
      const newRoomId = `direct_${userInfo.id}_${member.id}_${Date.now()}`;
      const newRoom: ChatRoom = {
        id: newRoomId,
        type: 'team_internal',
        participants: [userInfo.id, member.id],
        title: `Chat with ${member.name}`,
        description: `Direct chat with ${member.name} (${member.role})`
      };

      // Create room on backend
      await api.post('/chat/rooms', newRoom);
      await api.post(`/chat/rooms/${newRoomId}/join`);

      setRooms([...rooms, newRoom]);
      setMessages({ ...messages, [newRoomId]: [] });
      setActiveRoom(newRoomId);
      setActiveTab('chat');
      setSelectedMember(null);

      toast.success(`Started chat with ${member.name}`);
    } catch (error) {
      console.error('Error creating direct chat:', error);
      toast.error('Failed to start chat');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasChatAccess()) {
      console.log('Chat access denied - not authenticated as team/admin user');
      return;
    }

    const file = event.target.files?.[0];
    if (!file || !activeRoom) return;

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('roomId', activeRoom);

      const response = await api.post('/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = response.data;
      if (data.success) {
        // Send file message
        await sendFileMessage(data.fileUrl, file.name, file.size, file.type);
        toast.success('File uploaded successfully');
      } else {
        toast.error('Failed to upload file');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      const malware = parseMalwareError(error);
      if (malware.isMalware) {
        setMalwareWarning({ open: true, threat: malware.threat, fileName: file.name });
      } else {
        toast.error('Failed to upload file');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const sendFileMessage = async (fileUrl: string, fileName: string, fileSize: number, fileMimeType: string) => {
    if (!activeRoom) return;

    try {
      const response = await api.post(`/chat/rooms/${activeRoom}/messages`, {
        message: fileName,
        type: fileMimeType.startsWith('image/') ? 'image' : 'file',
        fileUrl,
        fileName,
        fileSize,
        fileMimeType,
      });
      const data = response.data;
      if (data.success) {
        setMessages(prev => ({
          ...prev,
          [activeRoom]: [...(prev[activeRoom] || []), data.message]
        }));
      }
    } catch (error) {
      console.error('Error sending file message:', error);
    }
  };

  const downloadFile = async (fileUrl: string, fileName: string) => {
    try {
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  const sendMessage = async () => {
    if (!hasChatAccess()) {
      console.log('Chat access denied - not authenticated as team/admin user');
      return;
    }

    if (!newMessage.trim() || !activeRoom) return;

    try {
      const response = await api.post(`/chat/rooms/${activeRoom}/messages`, {
        message: newMessage.trim(),
        type: 'text',
      });
      const data = response.data;
      if (data.success) {
        setMessages(prev => ({
          ...prev,
          [activeRoom]: [...(prev[activeRoom] || []), data.message]
        }));
        setNewMessage('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getCurrentRoom = () => {
    return rooms.find(room => room.id === activeRoom);
  };

  const getRoomIcon = (roomType: string) => {
    switch (roomType) {
      case 'user_team':
        return <HeadphonesIcon className="h-4 w-4" />;
      case 'team_internal':
        return <Users className="h-4 w-4" />;
      default:
        return <MessageCircle className="h-4 w-4" />;
    }
  };

  const getTotalUnreadCount = () => {
    return Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  };

  // Don't show chat if user doesn't have chat access
  if (!hasChatAccess()) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen ? (
        // Chat trigger button
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full h-14 w-14 shadow-lg bg-blue-600 hover:bg-blue-700 relative"
          size="icon"
        >
          <MessageCircle className="h-6 w-6 text-white" />
          {getTotalUnreadCount() > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs bg-red-500 text-white flex items-center justify-center">
              {getTotalUnreadCount() > 99 ? '99+' : getTotalUnreadCount()}
            </Badge>
          )}
        </Button>
      ) : (
        // Chat window
        <Card className={`w-80 bg-white shadow-xl border-0 transition-all duration-300 ${
          isMinimized ? 'h-12' : 'max-h-[75vh] flex flex-col'
        }`}>
          {/* Chat Header */}
          <CardHeader className="p-3 bg-blue-600 text-white rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {getCurrentRoom() && getRoomIcon(getCurrentRoom()!.type)}
                <div>
                  <CardTitle className="text-sm font-medium">
                    {getCurrentRoom()?.title || 'Chat'}
                  </CardTitle>
                  {rooms.length > 1 && (
                    <p className="text-xs opacity-90">
                      {rooms.length} rooms available
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-white hover:bg-white/20"
                  onClick={() => setIsMinimized(!isMinimized)}
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-white hover:bg-white/20"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardHeader>

          {!isMinimized && (
            <CardContent className="p-0 flex flex-col flex-1 min-h-0">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="chat" className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Chat
                  </TabsTrigger>
                  <TabsTrigger value="team" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Team
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="chat" className="flex-1 flex flex-col m-0">
                  {/* Room Selector */}
                  {rooms.length > 1 && (
                    <div className="p-2 border-b bg-gray-50">
                      <div className="flex space-x-1">
                        {rooms.map((room) => (
                          <Button
                            key={room.id}
                            variant={activeRoom === room.id ? 'default' : 'ghost'}
                            size="sm"
                            className="text-xs relative"
                            onClick={() => setActiveRoom(room.id)}
                          >
                            {getRoomIcon(room.type)}
                            <span className="ml-1">{room.title}</span>
                            {unreadCounts[room.id] > 0 && (
                              <Badge className="ml-1 h-4 w-4 rounded-full p-0 text-xs bg-red-500 text-white flex items-center justify-center">
                                {unreadCounts[room.id] > 9 ? '9+' : unreadCounts[room.id]}
                              </Badge>
                            )}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Messages Area */}
                  <ScrollArea className="flex-1 px-3 py-2">
                    {loading ? (
                      <div className="flex items-center justify-center h-32">
                        <div className="text-sm text-gray-500">Loading messages...</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(messages[activeRoom || ''] || []).map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.userId === userInfo?.id ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                                message.userId === userInfo?.id
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 text-gray-900'
                              }`}
                            >
                              {message.userId !== userInfo?.id && (
                                <div className="text-xs opacity-75 mb-1">
                                  {message.userName}
                                  {message.userRole !== 'user' && (
                                    <Badge variant="secondary" className="ml-1 text-xs">
                                      {message.userRole}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              
                              {/* Message content based on type */}
                              {message.type === 'text' ? (
                                <div>{message.message}</div>
                              ) : message.type === 'image' ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4" />
                                    <span className="text-xs">{message.fileName}</span>
                                  </div>
                                  {message.fileUrl && (
                                    <img 
                                      src={message.fileUrl} 
                                      alt={message.fileName} 
                                      className="max-w-full rounded cursor-pointer"
                                      onClick={() => window.open(message.fileUrl, '_blank')}
                                    />
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs p-1"
                                    onClick={() => downloadFile(message.fileUrl!, message.fileName!)}
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </Button>
                                </div>
                              ) : message.type === 'file' ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <File className="h-4 w-4" />
                                    <span className="text-xs">{message.fileName}</span>
                                  </div>
                                  {message.fileSize && (
                                    <div className="text-xs opacity-75">
                                      {(message.fileSize / 1024 / 1024).toFixed(2)} MB
                                    </div>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs p-1"
                                    onClick={() => downloadFile(message.fileUrl!, message.fileName!)}
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </Button>
                                </div>
                              ) : (
                                <div>{message.message}</div>
                              )}
                              
                              <div className={`text-xs mt-1 opacity-75 ${
                                message.userId === userInfo?.id ? 'text-blue-100' : 'text-gray-500'
                              }`}>
                                {formatTime(message.timestamp)}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </ScrollArea>

                  {/* Message Input */}
                  <div className="p-3 border-t bg-gray-50 shadow-inner rounded-b-lg">
                    <div className="flex space-x-2 items-center">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="*/*"
                      />
                      <div className="relative group">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 bg-white border border-gray-200 shadow-sm hover:bg-blue-50"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          aria-label="Attach file"
                        >
                          {uploading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Paperclip className="h-5 w-5 text-blue-600" />
                          )}
                        </Button>
                        <span className="absolute left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs bg-black text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                          Attach file
                        </span>
                      </div>
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        className="flex-1 text-sm bg-white border border-gray-200 rounded px-3 py-2 shadow-sm focus:border-blue-400"
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={!newMessage.trim()}
                        size="icon"
                        className="h-10 w-10 bg-blue-600 text-white hover:bg-blue-700 shadow"
                        aria-label="Send message"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="team" className="flex-1 flex flex-col m-0">
                  {/* Team Members List */}
                  <ScrollArea className="flex-1 px-3 py-2">
                    {loading ? (
                      <div className="flex items-center justify-center h-32">
                        <div className="text-sm text-gray-500">Loading team members...</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-gray-700">
                            Team Members ({teamMembers.length})
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={fetchTeamMembers}
                            className="h-6 text-xs"
                          >
                            Refresh
                          </Button>
                        </div>
                        {teamMembers.map((member) => (
                        <div 
                          key={member.id} 
                          className="flex items-center space-x-3 p-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors border border-transparent hover:border-blue-200"
                          onClick={() => createDirectChat(member)}
                          title={`Click to chat with ${member.name}`}
                        >
                          <div className="relative">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={member.avatar} alt={member.name} />
                              <AvatarFallback className="text-xs">
                                {member.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white ${
                              member.isOnline ? 'bg-green-500' : 'bg-gray-400'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{member.name}</div>
                            <div className="text-xs text-gray-500">
                              {member.isOnline ? (
                                <span className="text-green-600 flex items-center gap-1">
                                  <Circle className="h-2 w-2 fill-current" />
                                  Online
                                </span>
                              ) : (
                                <span className="text-gray-400">
                                  {member.lastSeen || 'Offline'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={member.isOnline ? "default" : "secondary"} className="text-xs">
                              {member.role}
                            </Badge>
                            <MessageCircle className="h-3 w-3 text-blue-500" />
                          </div>
                        </div>
                        ))}
                        {teamMembers.length === 0 && (
                          <div className="text-center text-gray-500 py-8">
                            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No team members found</p>
                          </div>
                        )}
                      </div>
                    )}
                  </ScrollArea>

                  {/* Message Input */}
                  <div className="p-3 border-t bg-gray-50 shadow-inner rounded-b-lg">
                    <div className="flex space-x-2 items-center">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="*/*"
                      />
                      <div className="relative group">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 bg-white border border-gray-200 shadow-sm hover:bg-blue-50"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          aria-label="Attach file"
                        >
                          {uploading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Paperclip className="h-5 w-5 text-blue-600" />
                          )}
                        </Button>
                        <span className="absolute left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs bg-black text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                          Attach file
                        </span>
                      </div>
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        className="flex-1 text-sm bg-white border border-gray-200 rounded px-3 py-2 shadow-sm focus:border-blue-400"
                        disabled={!activeRoom}
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || !activeRoom}
                        size="icon"
                        className="h-10 w-10 bg-blue-600 text-white hover:bg-blue-700 shadow"
                        aria-label="Send message"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          )}
        </Card>
      )}
      <MalwareWarningDialog
        open={malwareWarning.open}
        onClose={() => setMalwareWarning({ open: false })}
        threat={malwareWarning.threat}
        fileName={malwareWarning.fileName}
      />
    </div>
  );
};

export default ChatApplet;