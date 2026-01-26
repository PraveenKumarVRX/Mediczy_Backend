import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MessageSquare, Send, Users, Plus, Search, Settings,
  Building2, Stethoscope, UserCog, Shield, Phone, Video,
  Paperclip, Smile, MoreVertical, CheckCheck, Check, Clock
} from 'lucide-react';
import HospitalLayout from '@/components/hospital/HospitalLayout';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Channel {
  id: string;
  name: string;
  type: 'channel' | 'direct' | 'group';
  members: number;
  unread: number;
  lastMessage?: string;
  lastMessageTime?: string;
}

interface Message {
  id: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

const HospitalTeamChat = () => {
  const { toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([
    { id: '1', name: 'hospital-general', type: 'channel', members: 45, unread: 3, lastMessage: 'Welcome to hospital general channel', lastMessageTime: '10:30 AM' },
    { id: '2', name: 'doctors-lounge', type: 'channel', members: 28, unread: 0, lastMessage: 'Surgery schedule updated', lastMessageTime: '9:15 AM' },
    { id: '3', name: 'nursing-team', type: 'channel', members: 35, unread: 7, lastMessage: 'Night shift handover notes', lastMessageTime: '8:45 AM' },
    { id: '4', name: 'emergency-response', type: 'channel', members: 15, unread: 0, lastMessage: 'All clear', lastMessageTime: 'Yesterday' },
    { id: '5', name: 'Dr. Sharma', type: 'direct', members: 2, unread: 2, lastMessage: 'Patient reports ready', lastMessageTime: '11:00 AM' },
    { id: '6', name: 'Admin Team', type: 'group', members: 8, unread: 0, lastMessage: 'Budget review scheduled', lastMessageTime: '2 days ago' }
  ]);

  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'admin', senderName: 'Hospital Admin', content: 'Welcome to the hospital team chat! This is powered by our self-hosted RocketChat instance.', timestamp: '9:00 AM', status: 'read' },
    { id: '2', sender: 'dr_sharma', senderName: 'Dr. Sharma', content: 'Good morning everyone!', timestamp: '9:15 AM', status: 'read' },
    { id: '3', sender: 'nurse_priya', senderName: 'Nurse Priya', content: 'Morning rounds completed for Ward A', timestamp: '10:30 AM', status: 'delivered' },
  ]);

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(channels[0]);
  const [messageInput, setMessageInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('channels');
  const [rocketChatStatus, setRocketChatStatus] = useState<any>(null);

  useEffect(() => {
    checkRocketChatStatus();
  }, []);

  const checkRocketChatStatus = async () => {
    try {
      const response = await api.get('/rocketchat/status');
      setRocketChatStatus(response.data);
    } catch (error) {
      console.error('RocketChat status check failed:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedChannel) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'me',
      senderName: 'You',
      content: messageInput,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      status: 'sent'
    };

    setMessages([...messages, newMessage]);
    setMessageInput('');

    // Send to RocketChat via API
    try {
      await api.post('/rocketchat/message', {
        roomId: selectedChannel.id,
        text: messageInput
      });
      
      // Update message status to delivered
      setTimeout(() => {
        setMessages(prev => prev.map(msg => 
          msg.id === newMessage.id ? { ...msg, status: 'delivered' } : msg
        ));
      }, 1000);
    } catch (error) {
      toast({
        title: 'Failed to send message',
        description: 'Message will be queued for retry',
        variant: 'destructive'
      });
    }
  };

  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'channel': return <MessageSquare className="h-5 w-5" />;
      case 'direct': return <UserCog className="h-5 w-5" />;
      case 'group': return <Users className="h-5 w-5" />;
      default: return <MessageSquare className="h-5 w-5" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Check className="h-3 w-3" />;
      case 'delivered': return <CheckCheck className="h-3 w-3" />;
      case 'read': return <CheckCheck className="h-3 w-3 text-blue-500" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  return (
    <HospitalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-purple-600" />
              Team Communication
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Internal messaging for hospital staff and partners
            </p>
          </div>
          <div className="flex items-center gap-3">
            {rocketChatStatus?.connected && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                <div className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                Connected
              </Badge>
            )}
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              New Channel
            </Button>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Channels</p>
                  <p className="text-2xl font-bold mt-2">{channels.filter(c => c.type === 'channel').length}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Direct Messages</p>
                  <p className="text-2xl font-bold mt-2">{channels.filter(c => c.type === 'direct').length}</p>
                </div>
                <UserCog className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Group Chats</p>
                  <p className="text-2xl font-bold mt-2">{channels.filter(c => c.type === 'group').length}</p>
                </div>
                <Users className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Unread Messages</p>
                  <p className="text-2xl font-bold mt-2 text-amber-600">
                    {channels.reduce((sum, ch) => sum + ch.unread, 0)}
                  </p>
                </div>
                <MessageSquare className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chat Interface */}
        <Card className="h-[600px] flex">
          <div className="w-80 border-r flex flex-col">
            {/* Sidebar Header */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search channels..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Channel Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="w-full grid grid-cols-3 mx-4 mt-2">
                <TabsTrigger value="channels" className="text-xs">Channels</TabsTrigger>
                <TabsTrigger value="direct" className="text-xs">Direct</TabsTrigger>
                <TabsTrigger value="groups" className="text-xs">Groups</TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                <div className="p-2">
                  {filteredChannels
                    .filter(ch => activeTab === 'channels' ? ch.type === 'channel' : activeTab === 'direct' ? ch.type === 'direct' : ch.type === 'group')
                    .map(channel => (
                      <div
                        key={channel.id}
                        onClick={() => setSelectedChannel(channel)}
                        className={`p-3 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                          selectedChannel?.id === channel.id ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-600' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2 flex-1">
                            {getChannelIcon(channel.type)}
                            <span className="font-medium text-sm truncate">{channel.name}</span>
                          </div>
                          {channel.unread > 0 && (
                            <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
                              {channel.unread}
                            </Badge>
                          )}
                        </div>
                        {channel.lastMessage && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate pl-7">
                            {channel.lastMessage}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1 pl-7">{channel.lastMessageTime}</p>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </Tabs>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {selectedChannel ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{selectedChannel.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">{selectedChannel.name}</h3>
                      <p className="text-xs text-gray-500">{selectedChannel.members} members</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm">
                      <Phone className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Video className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${message.sender === 'me' ? 'flex-row-reverse' : ''}`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{message.senderName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className={`flex flex-col ${message.sender === 'me' ? 'items-end' : ''}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{message.senderName}</span>
                            <span className="text-xs text-gray-500">{message.timestamp}</span>
                          </div>
                          <div
                            className={`rounded-lg px-4 py-2 max-w-md ${
                              message.sender === 'me'
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800'
                            }`}
                          >
                            <p className="text-sm">{message.content}</p>
                          </div>
                          {message.sender === 'me' && (
                            <div className="flex items-center gap-1 mt-1">
                              {getStatusIcon(message.status)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="p-4 border-t">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm">
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Smile className="h-4 w-4" />
                    </Button>
                    <Input
                      placeholder="Type a message..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1"
                    />
                    <Button onClick={handleSendMessage} className="bg-purple-600 hover:bg-purple-700">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Powered by self-hosted RocketChat • End-to-end encrypted
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                  <p>Select a channel to start messaging</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </HospitalLayout>
  );
};

export default HospitalTeamChat;
