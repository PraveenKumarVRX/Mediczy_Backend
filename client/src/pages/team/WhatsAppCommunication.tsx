import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import MainLayout from '@/components/layout/MainLayout';
import { 
  MessageSquare, 
  Send, 
  User, 
  Phone, 
  Clock, 
  CheckCircle2,
  Search,
  Filter,
  MoreVertical,
  Archive,
  Star,
  Trash2
} from 'lucide-react';
import api from '@/utils/api';
import { formatDistanceToNow } from 'date-fns';

interface WhatsAppConversation {
  id: string;
  customerName: string;
  customerPhone: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  status: 'active' | 'resolved' | 'archived';
  assignedTo?: string;
}

interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: string;
  direction: 'incoming' | 'outgoing';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  mediaUrl?: string;
}

const normalizeDirection = (direction?: string): 'incoming' | 'outgoing' => {
  const normalized = (direction || '').toLowerCase();
  if (normalized === 'incoming' || normalized === 'inbound') return 'incoming';
  return 'outgoing';
};

const normalizeStatus = (status?: string): WhatsAppMessage['status'] => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'delivered' || normalized === 'read') return normalized;
  if (normalized === 'failed' || normalized === 'undelivered') return 'failed';
  return 'sent';
};

const normalizeConversation = (conversation: any): WhatsAppConversation | null => {
  const phone = conversation?.customerPhone || conversation?.phoneNumber || conversation?.to || conversation?.from;
  if (!phone) return null;
  return {
    id: conversation?.id || phone,
    customerName: conversation?.customerName || phone,
    customerPhone: phone,
    lastMessage: conversation?.lastMessage || conversation?.lastMessage?.body || '',
    lastMessageTime: conversation?.lastMessageTime || conversation?.lastActivity || new Date().toISOString(),
    unreadCount: Number.isFinite(conversation?.unreadCount) ? conversation.unreadCount : 0,
    status: conversation?.status || 'active',
    assignedTo: conversation?.assignedTo
  };
};

const normalizeMessages = (items: any[]): WhatsAppMessage[] => (
  (items || []).map((msg) => ({
    id: msg?.id || msg?.sid || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: msg?.from || '',
    to: msg?.to || '',
    body: msg?.body || msg?.message || '',
    timestamp: msg?.timestamp || msg?.dateCreated || new Date().toISOString(),
    direction: normalizeDirection(msg?.direction),
    status: normalizeStatus(msg?.status),
    mediaUrl: msg?.mediaUrl
  }))
);

const WhatsAppCommunication = () => {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'resolved'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConversations();
  }, [filterStatus]);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation.id);
    }
  }, [activeConversation]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await api.get('/whatsapp-production/conversations', {
        params: { status: filterStatus !== 'all' ? filterStatus : undefined }
      });
      const normalized = (response.data.conversations || [])
        .map(normalizeConversation)
        .filter(Boolean) as WhatsAppConversation[];
      setConversations(normalized);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const encodedId = encodeURIComponent(conversationId);
      const response = await api.get(`/whatsapp-production/conversations/${encodedId}/messages`);
      setMessages(normalizeMessages(response.data.messages || []));
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConversation) return;

    try {
      const encodedPhone = encodeURIComponent(activeConversation.customerPhone);
      const response = await api.post(`/whatsapp-production/conversations/${encodedPhone}/send`, {
        message: newMessage
      });

      if (response.data.success) {
        setNewMessage('');
        loadMessages(activeConversation.id);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.customerPhone.includes(searchQuery)
  );

  return (
    <MainLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">WhatsApp Communication</h1>
            <p className="text-muted-foreground">Manage customer conversations via WhatsApp</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="gap-1">
              <MessageSquare className="h-3 w-3" />
              {conversations.length} Conversations
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {conversations.filter(c => c.unreadCount > 0).length} Unread
            </Badge>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
          {/* Conversations List */}
          <Card className="col-span-4 flex flex-col overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-3">
                <CardTitle className="text-base">Conversations</CardTitle>
                <Button variant="ghost" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}
                >
                  All
                </Button>
                <Button
                  variant={filterStatus === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('active')}
                >
                  Active
                </Button>
                <Button
                  variant={filterStatus === 'resolved' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('resolved')}
                >
                  Resolved
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
                  <p>No conversations found</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredConversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => setActiveConversation(conv)}
                      className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                        activeConversation?.id === conv.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{conv.customerName}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {conv.customerPhone}
                            </div>
                          </div>
                        </div>
                        {conv.unreadCount > 0 && (
                          <Badge variant="default" className="rounded-full h-5 w-5 flex items-center justify-center p-0">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-2">
                        {conv.lastMessage}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(conv.lastMessageTime), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat Window */}
          <Card className="col-span-8 flex flex-col overflow-hidden">
            {activeConversation ? (
              <>
                {/* Chat Header */}
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{activeConversation.customerName}</h3>
                        <p className="text-sm text-muted-foreground">{activeConversation.customerPhone}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon">
                        <Star className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Archive className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* Messages */}
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          msg.direction === 'outgoing'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs opacity-70">
                            {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          {msg.direction === 'outgoing' && (
                            <CheckCircle2 className={`h-3 w-3 ${
                              msg.status === 'read' ? 'text-blue-500' : 'opacity-70'
                            }`} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>

                {/* Message Input */}
                <div className="border-t p-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type your message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      className="flex-1"
                    />
                    <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Messages sent through WhatsApp Business API (+918098998998)
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Select a conversation</p>
                  <p className="text-sm">Choose a customer conversation to start messaging</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default WhatsAppCommunication;
