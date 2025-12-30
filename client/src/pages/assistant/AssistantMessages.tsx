import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  MessageSquare, 
  Search, 
  Send,
  User,
  Phone,
  Loader2,
  Clock,
  CheckCheck,
  Bell
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import api from '@/utils/api';

interface Message {
  id: string;
  patientId: string;
  patientName: string;
  content: string;
  timestamp: string;
  isFromPatient: boolean;
  isRead: boolean;
}

interface Conversation {
  patientId: string;
  patientName: string;
  patientPhone: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: Message[];
}

const AssistantMessages = () => {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('assistantToken');
    if (!token) {
      navigate('/assistant/login');
      return;
    }
    fetchConversations();
  }, [navigate]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/assistant/messages');
      if (data.success) {
        setConversations(data.conversations);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      // Mock data
      setConversations([
        {
          patientId: 'PAT001',
          patientName: 'Amit Sharma',
          patientPhone: '+91 98765 43210',
          lastMessage: 'Thank you for the appointment confirmation',
          lastMessageTime: '2025-12-30T10:30:00',
          unreadCount: 2,
          messages: [
            { id: '1', patientId: 'PAT001', patientName: 'Amit Sharma', content: 'Hi, I wanted to confirm my appointment for tomorrow', timestamp: '2025-12-30T10:00:00', isFromPatient: true, isRead: true },
            { id: '2', patientId: 'PAT001', patientName: 'Amit Sharma', content: 'Yes, your appointment with Dr. Roberts is confirmed for tomorrow at 10:00 AM', timestamp: '2025-12-30T10:15:00', isFromPatient: false, isRead: true },
            { id: '3', patientId: 'PAT001', patientName: 'Amit Sharma', content: 'Thank you for the appointment confirmation', timestamp: '2025-12-30T10:30:00', isFromPatient: true, isRead: false },
            { id: '4', patientId: 'PAT001', patientName: 'Amit Sharma', content: 'Should I bring my previous reports?', timestamp: '2025-12-30T10:31:00', isFromPatient: true, isRead: false },
          ]
        },
        {
          patientId: 'PAT002',
          patientName: 'Priya Patel',
          patientPhone: '+91 91234 56789',
          lastMessage: 'When will my test results be ready?',
          lastMessageTime: '2025-12-30T09:45:00',
          unreadCount: 1,
          messages: [
            { id: '5', patientId: 'PAT002', patientName: 'Priya Patel', content: 'When will my test results be ready?', timestamp: '2025-12-30T09:45:00', isFromPatient: true, isRead: false },
          ]
        },
        {
          patientId: 'PAT003',
          patientName: 'Rajesh Kumar',
          patientPhone: '+91 87654 32109',
          lastMessage: 'Your prescription has been sent to the pharmacy',
          lastMessageTime: '2025-12-29T16:00:00',
          unreadCount: 0,
          messages: [
            { id: '6', patientId: 'PAT003', patientName: 'Rajesh Kumar', content: 'Can you send my prescription to MediPharm?', timestamp: '2025-12-29T15:30:00', isFromPatient: true, isRead: true },
            { id: '7', patientId: 'PAT003', patientName: 'Rajesh Kumar', content: 'Your prescription has been sent to the pharmacy', timestamp: '2025-12-29T16:00:00', isFromPatient: false, isRead: true },
          ]
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.patientPhone.includes(searchQuery)
  );

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    setSending(true);
    try {
      // Mock send
      const newMsg: Message = {
        id: Date.now().toString(),
        patientId: selectedConversation.patientId,
        patientName: selectedConversation.patientName,
        content: newMessage,
        timestamp: new Date().toISOString(),
        isFromPatient: false,
        isRead: true
      };
      
      setConversations(prev => prev.map(conv => {
        if (conv.patientId === selectedConversation.patientId) {
          return {
            ...conv,
            messages: [...conv.messages, newMsg],
            lastMessage: newMessage,
            lastMessageTime: new Date().toISOString()
          };
        }
        return conv;
      }));
      
      setSelectedConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, newMsg]
      } : null);
      
      setNewMessage('');
      toast.success('Message sent');
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSendReminder = (patientName: string) => {
    toast.success(`Appointment reminder sent to ${patientName}`);
  };

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4 md:p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-purple-600" />
              Messages
              {totalUnread > 0 && (
                <Badge className="bg-red-500 text-white">{totalUnread} new</Badge>
              )}
            </h1>
            <p className="text-muted-foreground mt-1">
              Communicate with patients and send reminders
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Conversations List */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search patients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground opacity-50 mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations</p>
                </div>
              ) : (
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {filteredConversations.map((conv) => (
                    <div
                      key={conv.patientId}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedConversation?.patientId === conv.patientId ? 'bg-purple-50' : ''
                      }`}
                      onClick={() => setSelectedConversation(conv)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="bg-purple-100 p-2 rounded-full">
                          <User className="h-4 w-4 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium truncate">{conv.patientName}</p>
                            {conv.unreadCount > 0 && (
                              <Badge className="bg-purple-600 text-white text-xs">
                                {conv.unreadCount}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {conv.lastMessage}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTime(conv.lastMessageTime)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="md:col-span-2">
            {selectedConversation ? (
              <>
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-100 p-2 rounded-full">
                        <User className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{selectedConversation.patientName}</CardTitle>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {selectedConversation.patientPhone}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleSendReminder(selectedConversation.patientName)}
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      Send Reminder
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Messages */}
                  <div className="h-[400px] overflow-y-auto p-4 space-y-4">
                    {selectedConversation.messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.isFromPatient ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            msg.isFromPatient
                              ? 'bg-gray-100 text-gray-900'
                              : 'bg-purple-600 text-white'
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <div className={`flex items-center gap-1 mt-1 text-xs ${
                            msg.isFromPatient ? 'text-gray-500' : 'text-purple-200'
                          }`}>
                            <Clock className="h-3 w-3" />
                            {formatTime(msg.timestamp)}
                            {!msg.isFromPatient && (
                              <CheckCheck className={`h-3 w-3 ${msg.isRead ? 'text-blue-300' : ''}`} />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Message Input */}
                  <div className="border-t p-4">
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="min-h-[80px] resize-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                      />
                      <Button 
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || sending}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
                <MessageSquare className="h-16 w-16 opacity-50 mb-4" />
                <p>Select a conversation to view messages</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AssistantMessages;
