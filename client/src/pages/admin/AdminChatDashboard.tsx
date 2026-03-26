import React, { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  MessageSquare,
  Send,
  Settings,
  Hash,
  Lock,
  Users,
  Bot,
  Search,
  Plus,
  MoreHorizontal,
  Phone,
  Video,
  Info,
  Bell,
  BellOff,
  Pin,
  Star,
  Archive,
  Trash2,
  Edit,
  UserPlus,
  Shield,
  Crown,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  File,
  Image,
  Smile,
  AtSign,
  Paperclip,
  BarChart3,
  Activity,
  Globe,
  Zap,
  RefreshCw,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Ticket,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  ArrowUpRight,
  Smartphone,
  Mail
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import api from '@/utils/api';

export default function AdminChatDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedRoom, setSelectedRoom] = useState('general');
  const [isLoading, setIsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [chatBotEnabled, setChatBotEnabled] = useState(true);
  const [roomMessages, setRoomMessages] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const adminToken = localStorage.getItem('adminToken');
  const teamToken = localStorage.getItem('teamToken');
  
  // Determine which layout to use
  const isTeamUser = !!teamToken && !adminToken;
  const LayoutComponent = isTeamUser ? MainLayout : AdminLayout;

  // Mock data for RocketChat-style interface
  const [rooms, setRooms] = useState<any[]>([]);
  
  const [agents, setAgents] = useState([
    {
      id: 'agent-1',
      name: 'Dr. Sarah Wilson',
      role: 'Senior Medical Agent',
      status: 'online',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
      activeChats: 3,
      totalChats: 127,
      avgResponseTime: '2.3 min',
      rating: 4.9
    },
    {
      id: 'agent-2',
      name: 'John Anderson',
      role: 'Support Agent',
      status: 'online',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
      activeChats: 5,
      totalChats: 89,
      avgResponseTime: '1.8 min',
      rating: 4.7
    },
    {
      id: 'agent-3',
      name: 'Emily Chen',
      role: 'Emergency Coordinator',
      status: 'away',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emily',
      activeChats: 1,
      totalChats: 156,
      avgResponseTime: '1.2 min',
      rating: 5.0
    },
    {
      id: 'agent-4',
      name: 'Michael Brown',
      role: 'Patient Care Agent',
      status: 'busy',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
      activeChats: 7,
      totalChats: 203,
      avgResponseTime: '3.1 min',
      rating: 4.8
    },
    {
      id: 'agent-5',
      name: 'Lisa Martinez',
      role: 'Medical Agent',
      status: 'offline',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lisa',
      activeChats: 0,
      totalChats: 94,
      avgResponseTime: '2.7 min',
      rating: 4.6
    }
  ]);

  const [directMessages, setDirectMessages] = useState([
    {
      id: 'dm1',
      name: 'Dr. Sarah Johnson',
      avatar: null,
      status: 'online',
      unread: 2,
      lastMessage: 'Patient report is ready',
      lastActivity: '3 mins ago'
    },
    {
      id: 'dm2',
      name: 'Admin Team',
      avatar: null,
      status: 'away',
      unread: 0,
      lastMessage: 'System maintenance scheduled',
      lastActivity: '1 hour ago'
    }
  ]);

  const [whatsappConversations, setWhatsappConversations] = useState<any[]>([]);
  const [selectedWhatsappNumber, setSelectedWhatsappNumber] = useState<string | null>(null);
  const [whatsappMessages, setWhatsappMessages] = useState<any[]>([]);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [botConversationId, setBotConversationId] = useState<string | null>(null);
  const [isBotTyping, setIsBotTyping] = useState(false);

  const [chatBots, setChatBots] = useState([
    {
      id: 'health-bot',
      name: 'Health Assistant',
      description: 'AI-powered health consultation bot powered by Dr. iSHA',
      status: 'active',
      interactions: 1247,
      accuracy: 94.2,
      responseTime: '0.8s',
      channels: ['general', 'support'],
      sibEndpoint: '/sib-chatbots/health-bot/chat'
    },
    {
      id: 'appointment-bot',
      name: 'Appointment Manager',
      description: 'Automated appointment booking and reminders',
      status: 'active',
      interactions: 567,
      accuracy: 98.1,
      responseTime: '0.3s',
      channels: ['doctors'],
      sibEndpoint: '/sib-chatbots/appointment-bot/chat'
    },
    {
      id: 'emergency-bot',
      name: 'Emergency Dispatcher',
      description: 'Emergency response and triage coordination',
      status: 'active',
      interactions: 89,
      accuracy: 99.7,
      responseTime: '0.1s',
      channels: ['emergency'],
      sibEndpoint: '/sib-chatbots/emergency-bot/chat'
    }
  ]);

  // Support Tickets Integration
  const [supportTickets, setSupportTickets] = useState([
    {
      id: 'TKT-001',
      title: 'Chat integration not working',
      description: 'Users report that chat messages are not being delivered in the patient-support channel.',
      status: 'open',
      priority: 'high',
      category: 'technical',
      requester: {
        name: 'Dr. Sarah Smith',
        email: 'sarah.smith@mediczy.com',
        role: 'Doctor'
      },
      assignee: {
        name: 'Tech Support Team',
        email: 'tech@mediczy.com'
      },
      createdAt: '2024-01-15T10:30:00Z',
      lastMessage: 'Investigating chat delivery issues',
      channel: 'patient-support',
      relatedMessages: 23
    },
    {
      id: 'TKT-002',
      title: 'Bot response delay in emergency channel',
      description: 'Emergency bot is showing delayed responses during critical situations.',
      status: 'in-progress',
      priority: 'critical',
      category: 'performance',
      requester: {
        name: 'Emergency Team',
        email: 'emergency@mediczy.com',
        role: 'Staff'
      },
      assignee: {
        name: 'John Davis',
        email: 'john.davis@mediczy.com'
      },
      createdAt: '2024-01-14T09:15:00Z',
      lastMessage: 'Optimizing bot response algorithms',
      channel: 'emergency',
      relatedMessages: 45
    },
    {
      id: 'TKT-003',
      title: 'Feature request: Voice messages in consultations',
      description: 'Doctors requesting voice message capability for patient consultations.',
      status: 'pending',
      priority: 'medium',
      category: 'feature-request',
      requester: {
        name: 'Dr. Michael Chen',
        email: 'michael.chen@mediczy.com',
        role: 'Doctor'
      },
      assignee: null,
      createdAt: '2024-01-12T11:45:00Z',
      lastMessage: 'Awaiting approval for voice feature implementation',
      channel: 'doctors',
      relatedMessages: 12
    }
  ]);

  const [ticketStats, setTicketStats] = useState({
    total: 15,
    open: 8,
    inProgress: 4,
    resolved: 3,
    avgResponseTime: '2.1 hours',
    chatRelated: 12,
    priorityDistribution: {
      critical: 2,
      high: 5,
      medium: 6,
      low: 2
    }
  });

  const [messages, setMessages] = useState<any[]>([]);

  const [stats, setStats] = useState({
    totalMessages: 15847,
    activeUsers: 234,
    onlineUsers: 89,
    totalChannels: 12,
    privateChannels: 4,
    botInteractions: 3892,
    avgResponseTime: '1.2s',
    messagesByHour: [45, 67, 89, 123, 156, 134, 98, 87, 76, 89, 123, 145],
    topChannels: [
      { name: 'general', messages: 4567 },
      { name: 'patient-support', messages: 3421 },
      { name: 'doctors', messages: 2876 }
    ]
  });

  const [dashboardOverview, setDashboardOverview] = useState<any | null>(null);
  const [sibHealth, setSibHealth] = useState<any | null>(null);

  const loadDashboardOverview = async () => {
    if (!adminToken) return;
    try {
      setAnalyticsLoading(true);
      const { data } = await api.get('/chat/dashboard/overview', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (data?.success && data?.overview) {
        setDashboardOverview(data.overview);
      }
    } catch (err: any) {
      console.error('Failed to load chat dashboard overview', err);
      toast({
        title: 'Analytics Unavailable',
        description: err?.response?.data?.message || 'Failed to load chat analytics',
        variant: 'destructive'
      });
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Load SIB chatbot health status
  const loadSIBHealth = async () => {
    try {
      const { data } = await api.get('/sib-chatbots/health');
      setSibHealth(data);
      
      // Update chatbot statuses based on SIB health
      if (data?.chatbots) {
        setChatBots(prev => prev.map(bot => {
          const sibBot = data.chatbots.find((b: any) => b.id === bot.id);
          return sibBot ? { ...bot, status: sibBot.status } : bot;
        }));
      }
    } catch (error) {
      console.error('Failed to load SIB health', error);
      setSibHealth({ success: false, sib: { status: 'offline' } });
    }
  };

  // Load WhatsApp conversations
  const loadWhatsAppConversations = async () => {
    try {
      const { data } = await api.get('/whatsapp-production/conversations');
      setWhatsappConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to load WhatsApp conversations', error);
    }
  };

  // Load WhatsApp messages for selected conversation
  const loadWhatsAppMessages = async (phoneNumber: string) => {
    try {
      const { data } = await api.get(`/whatsapp-production/conversations/${phoneNumber}/messages`);
      setWhatsappMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to load WhatsApp messages', error);
    }
  };

  // Send WhatsApp message
  const handleSendWhatsAppMessage = async () => {
    if (!whatsappMessage.trim() || !selectedWhatsappNumber) return;
    
    try {
      await api.post(`/whatsapp-production/conversations/${selectedWhatsappNumber}/send`, {
        message: whatsappMessage.trim()
      });
      
      setWhatsappMessage('');
      toast({
        title: 'Message Sent',
        description: 'WhatsApp message sent successfully'
      });
      
      // Reload messages
      loadWhatsAppMessages(selectedWhatsappNumber);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to send message',
        variant: 'destructive'
      });
    }
  };

  // Refresh WhatsApp conversations periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedRoom) {
        // Reload rooms to get updated WhatsApp conversations
        const loadRoomsAsync = async () => {
          try {
            const { data } = await api.get('/whatsapp-production/conversations');
            setWhatsappConversations(data.conversations || []);
            
            // Update rooms with latest WhatsApp data
            setRooms(prevRooms => {
              const nonWhatsappRooms = prevRooms.filter(r => !r.isWhatsApp);
              const whatsappRooms = (data.conversations || []).map((conv: any) => ({
                id: `whatsapp_${conv.phoneNumber}`,
                name: conv.phoneNumber,
                type: 'whatsapp',
                description: 'WhatsApp conversation',
                members: 2,
                unread: conv.unreadCount || 0,
                lastMessage: conv.lastMessage || 'No messages',
                lastActivity: conv.lastActivity ? new Date(conv.lastActivity).toLocaleString() : 'unknown',
                isPrivate: false,
                isMuted: false,
                isPinned: false,
                isWhatsApp: true,
                phoneNumber: conv.phoneNumber,
                messageCount: conv.messages?.length || 0
              }));
              return [...nonWhatsappRooms, ...whatsappRooms];
            });
          } catch (error) {
            console.error('Failed to refresh WhatsApp conversations', error);
          }
        };
        loadRoomsAsync();
      }
    }, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [selectedRoom]);

  // Load messages when conversation selected
  useEffect(() => {
    if (selectedWhatsappNumber) {
      loadWhatsAppMessages(selectedWhatsappNumber);
      const interval = setInterval(() => loadWhatsAppMessages(selectedWhatsappNumber), 10000); // Refresh every 10s
      return () => clearInterval(interval);
    }
  }, [selectedWhatsappNumber]);

  // Load available rooms for the admin
  useEffect(() => {
    const loadRooms = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Load WhatsApp conversations and convert to rooms
        let allRooms = [
          {
            id: 'dr-isha-bot',
            name: 'Dr. iSHA',
            type: 'bot',
            description: 'AI Medical Assistant',
            members: 1,
            unread: 0,
            lastMessage: 'Hello! I am Dr. iSHA, your AI medical assistant. How can I help you today?',
            lastActivity: 'now',
            isPrivate: false,
            isMuted: false,
            isPinned: true,
            isWhatsApp: false,
            isBot: true
          },
          {
            id: 'general',
            name: 'general',
            type: 'channel',
            description: 'General discussion and updates',
            members: 234,
            unread: 0,
            lastMessage: 'Welcome to the general chat',
            lastActivity: 'now',
            isPrivate: false,
            isMuted: false,
            isPinned: false,
            isWhatsApp: false
          },
          {
            id: 'patient-support',
            name: 'patient-support',
            type: 'channel',
            description: 'Patient support channel',
            members: 156,
            unread: 5,
            lastMessage: 'Patient inquiry received',
            lastActivity: '5 mins ago',
            isPrivate: false,
            isMuted: false,
            isPinned: true,
            isWhatsApp: false
          },
          {
            id: 'doctors',
            name: 'doctors',
            type: 'channel',
            description: 'Doctor coordination channel',
            members: 45,
            unread: 2,
            lastMessage: 'Morning rounds completed',
            lastActivity: '10 mins ago',
            isPrivate: true,
            isMuted: false,
            isPinned: false,
            isWhatsApp: false
          },
          {
            id: 'emergency',
            name: 'emergency',
            type: 'channel',
            description: 'Emergency notifications',
            members: 89,
            unread: 0,
            lastMessage: 'All clear',
            lastActivity: '1 hour ago',
            isPrivate: false,
            isMuted: false,
            isPinned: true,
            isWhatsApp: false
          }
        ];

        // Load WhatsApp conversations and add as channels
        try {
          const { data } = await api.get('/whatsapp-production/conversations');
          const whatsappRooms = (data.conversations || []).map((conv: any) => ({
            id: `whatsapp_${conv.phoneNumber}`,
            name: conv.phoneNumber,
            type: 'whatsapp',
            description: 'WhatsApp conversation',
            members: 2,
            unread: conv.unreadCount || 0,
            lastMessage: conv.lastMessage || 'No messages',
            lastActivity: conv.lastActivity ? new Date(conv.lastActivity).toLocaleString() : 'unknown',
            isPrivate: false,
            isMuted: false,
            isPinned: false,
            isWhatsApp: true,
            phoneNumber: conv.phoneNumber,
            messageCount: conv.messages?.length || 0
          }));
          
          allRooms = [...allRooms, ...whatsappRooms];
          setWhatsappConversations(data.conversations || []);
        } catch (error) {
          console.error('Failed to load WhatsApp conversations', error);
          // Add a test WhatsApp channel for now
          allRooms.push({
            id: 'whatsapp_test',
            name: 'WhatsApp',
            type: 'whatsapp',
            description: 'WhatsApp conversations',
            members: 2,
            unread: 0,
            lastMessage: 'Click to view WhatsApp messages',
            lastActivity: 'now',
            isPrivate: false,
            isMuted: false,
            isPinned: false,
            isWhatsApp: true,
            isBot: false,
            phoneNumber: '+917373007737',
            messageCount: 0
          });
        }
        
        console.log('All rooms loaded:', allRooms);
        console.log('Bot rooms:', allRooms.filter(r => r.isBot));
        setRooms(allRooms);
        if (!selectedRoom && allRooms.length > 0) {
          setSelectedRoom(allRooms[0].id);
        }
      } catch (e: any) {
        console.error('Failed to load chat rooms', e);
        setError(e?.response?.data?.message || 'Failed to load chat rooms');
      } finally {
        setIsLoading(false);
      }
    };

    loadRooms();
  }, []);

  // Load admin analytics overview (doesn't block the main UI)
  useEffect(() => {
    loadDashboardOverview();
    loadSIBHealth(); // Load SIB chatbot health status
  }, [adminToken]);

  // Load messages when room changes
  useEffect(() => {
    if (!selectedRoom) return;
    const loadMessages = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch real messages from the API
        const token = adminToken || teamToken;
        const response = await api.get(`/chat/rooms/${selectedRoom}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 50 }
        });
        
        if (response.data?.success && response.data?.messages) {
          // Transform API messages to match component format
          const formattedMessages = response.data.messages.map((msg: any, index: number) => ({
            id: msg.id || index + 1,
            sender: msg.userName || msg.userId || 'Unknown',
            avatar: msg.avatar || null,
            content: msg.message || msg.content || '',
            timestamp: msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'now',
            type: msg.source === 'whatsapp' ? 'whatsapp' : (msg.isBot ? 'bot' : 'text'),
            isBot: msg.isBot || false,
            isWhatsApp: msg.source === 'whatsapp',
            phoneNumber: msg.phoneNumber,
            reactions: msg.reactions || []
          }));
          setRoomMessages(formattedMessages);
        } else {
          setRoomMessages([]);
        }
      } catch (e: any) {
        console.error('Failed to load chat messages', e);
        setError(e?.response?.data?.message || 'Failed to load messages');
        setRoomMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [selectedRoom, adminToken, teamToken]);

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !selectedRoom) return;
    
    const userMessage = chatMessage.trim();
    setChatMessage('');
    
    // Add user message to local state
    const newUserMsg = {
      id: Date.now(),
      sender: 'Admin',
      avatar: null,
      content: userMessage,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
      isBot: false,
      reactions: []
    };
    
    setRoomMessages(prev => [...prev, newUserMsg]);

    // Check if this is a bot room (Dr. iSHA or chatbots)
    const currentRoomData = rooms.find(r => r.id === selectedRoom);
    const isAIBot = currentRoomData?.isBot || selectedRoom === 'dr-isha-bot';
    
    // Find if selected room is a chatbot from the chatBots list
    const selectedBot = chatBots.find(bot => 
      selectedRoom === bot.id || 
      selectedRoom === 'dr-isha-bot'
    );
    
    if (isAIBot || selectedBot) {
      try {
        setIsBotTyping(true);
        
        // Determine which bot to call
        const botId = selectedBot?.id || 'health-bot'; // Default to health-bot for Dr. iSHA
        const token = adminToken || teamToken;
        
        // Call SIB chatbot API
        const response = await api.post(`/sib-chatbots/${botId}/chat`, {
          message: userMessage,
          conversationId: botConversationId || `admin_${Date.now()}`,
          userId: null // Can be enhanced to pass actual user ID
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data?.success) {
          // Store conversation ID for context
          if (response.data.conversationId) {
            setBotConversationId(response.data.conversationId);
          }
          
          // Add bot response
          const botResponse = {
            id: Date.now() + 1,
            sender: response.data.botName || 'Dr. iSHA',
            avatar: null,
            content: response.data.response?.message || 'I apologize, I could not process that request.',
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            type: 'bot',
            isBot: true,
            reactions: [],
            metadata: {
              latency: response.data.response?.latency,
              provider: response.data.response?.provider,
              urgency: response.data.response?.urgency,
              triageColor: response.data.response?.triageColor,
              actions: response.data.response?.actions
            }
          };
          
          setRoomMessages(prev => [...prev, botResponse]);
          
          // Show urgency alert for emergency bot
          if (response.data.response?.triageColor === 'RED') {
            toast({
              title: '🚨 Emergency Alert',
              description: 'This situation requires immediate attention!',
              variant: 'destructive'
            });
          }
          
          // Update bot stats (interactions count)
          if (selectedBot) {
            setChatBots(prev => prev.map(b => 
              b.id === botId ? { ...b, interactions: b.interactions + 1 } : b
            ));
          }
        } else {
          throw new Error(response.data?.error || 'Bot response failed');
        }
      } catch (error: any) {
        console.error('Bot chat error:', error);
        
        // Add error message
        const errorMsg = {
          id: Date.now() + 1,
          sender: 'System',
          avatar: null,
          content: `⚠️ ${error?.response?.data?.error || 'Failed to get bot response. Please try again.'}`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          type: 'error',
          isBot: true,
          reactions: []
        };
        setRoomMessages(prev => [...prev, errorMsg]);
        
        toast({
          title: 'Bot Error',
          description: error?.response?.data?.error || 'Failed to communicate with AI assistant',
          variant: 'destructive'
        });
      } finally {
        setIsBotTyping(false);
      }
    } else {
      // Regular channel message (existing behavior)
      toast({
        title: 'Message Sent',
        description: 'Your message has been sent successfully',
      });
    }
  };

  const handleCreateRoom = (roomData) => {
    const newRoom = {
      id: `room_${Date.now()}`,
      name: roomData.name,
      type: 'channel',
      description: roomData.description,
      members: 1,
      unread: 0,
      lastMessage: 'Room created',
      lastActivity: 'now',
      isPrivate: roomData.private,
      isMuted: false,
      isPinned: false
    };
    setRooms(prev => [...prev, newRoom]);
    toast({ title: 'Room Created', description: `${roomData.name} has been created successfully` });
  };

  const currentRoom = rooms.find(r => r.id === selectedRoom) || rooms[0];

  if (isLoading) {
    return (
      <LayoutComponent>
        <div className="flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </LayoutComponent>
    );
  }

  return (
    <LayoutComponent>
      <div className="h-[calc(100vh-120px)] flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Chat Management</h1>
            <p className="text-muted-foreground">
              RocketChat-style admin dashboard for healthcare communication
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => setActiveTab('analytics')}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Button>
            <Button size="sm" onClick={() => setActiveTab('settings')}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">Total Messages</h3>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">
                  {(dashboardOverview?.totalMessages ?? stats.totalMessages).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">+12% from yesterday</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">Online Users</h3>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{dashboardOverview?.onlineTeamMembers ?? stats.onlineUsers}</div>
                <p className="text-xs text-muted-foreground">{dashboardOverview?.activeUsers ?? stats.activeUsers} total active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">Channels</h3>
                <Hash className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{dashboardOverview?.totalRooms ?? stats.totalChannels}</div>
                <p className="text-xs text-muted-foreground">{stats.privateChannels} private</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <h3 className="tracking-tight text-sm font-medium">Bot Interactions</h3>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{stats.botInteractions.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Avg {stats.avgResponseTime} response</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="chat" className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4" />
              <span>Chat Interface</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center space-x-2">
              <Smartphone className="h-4 w-4" />
              <span>WhatsApp</span>
            </TabsTrigger>
            <TabsTrigger value="tickets" className="flex items-center space-x-2">
              <Ticket className="h-4 w-4" />
              <span>Support Tickets</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="rooms" className="flex items-center space-x-2">
              <Hash className="h-4 w-4" />
              <span>Rooms & Channels</span>
            </TabsTrigger>
            <TabsTrigger value="bots" className="flex items-center space-x-2">
              <Bot className="h-4 w-4" />
              <span>Chat Bots</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {dashboardOverview ? 'Live server analytics' : 'Showing sample analytics'}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadDashboardOverview}
                disabled={!adminToken || analyticsLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between space-y-0 pb-2">
                    <h3 className="tracking-tight text-sm font-medium">Total Messages</h3>
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">
                    {(dashboardOverview?.totalMessages ?? stats.totalMessages).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between space-y-0 pb-2">
                    <h3 className="tracking-tight text-sm font-medium">Total Rooms</h3>
                    <Hash className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{dashboardOverview?.totalRooms ?? stats.totalChannels}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between space-y-0 pb-2">
                    <h3 className="tracking-tight text-sm font-medium">Active Users</h3>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{dashboardOverview?.activeUsers ?? stats.activeUsers}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between space-y-0 pb-2">
                    <h3 className="tracking-tight text-sm font-medium">Online Team</h3>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{dashboardOverview?.onlineTeamMembers ?? stats.onlineUsers}</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity (Last 24h)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="text-sm font-medium">Messages</div>
                    <Badge variant="outline">{dashboardOverview?.recentActivity?.last24h?.messages ?? '—'}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="text-sm font-medium">New Rooms</div>
                    <Badge variant="outline">{dashboardOverview?.recentActivity?.last24h?.newRooms ?? '—'}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Response Time</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="text-sm font-medium">Average Response</div>
                    <Badge variant="outline">
                      {dashboardOverview?.analytics?.averageResponseTime ?? '—'} {dashboardOverview?.analytics?.responseTimeUnit ?? 'min'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">Calculated from user-team conversations.</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Chat Interface Tab */}
          <TabsContent value="chat" className="flex-1 flex">
            <div className="flex flex-1 min-h-[400px] max-h-[calc(100vh-260px)] border rounded-lg overflow-hidden">
              {/* Sidebar */}
              <div className="w-80 border-r bg-muted/30">
                <div className="p-4 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search rooms, users, messages..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {/* Channels */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>CHANNELS</span>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <Plus className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Create Channel</DialogTitle>
                              <DialogDescription>
                                Create a new channel for team communication
                              </DialogDescription>
                            </DialogHeader>
                            <CreateChannelForm onSubmit={handleCreateRoom} />
                          </DialogContent>
                        </Dialog>
                      </div>
                      {rooms
                        .filter(room => !room.isBot)
                        .filter(room => 
                          searchQuery === '' || 
                          room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          room.description?.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((room) => (
                        <div
                          key={room.id}
                          className={`flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                            selectedRoom === room.id ? 'bg-blue-100 text-blue-700' : ''
                          }`}
                          onClick={() => {
                            setSelectedRoom(room.id);
                            if (room.isWhatsApp) {
                              setSelectedWhatsappNumber(room.phoneNumber);
                              loadWhatsAppMessages(room.phoneNumber);
                            } else {
                              setSelectedWhatsappNumber(null);
                            }
                          }}
                        >
                          <div className="flex items-center space-x-2 flex-1">
                            {room.isWhatsApp ? (
                              <Smartphone className="h-4 w-4 text-green-600" />
                            ) : room.isPrivate ? (
                              <Lock className="h-4 w-4" />
                            ) : (
                              <Hash className="h-4 w-4" />
                            )}
                            <span className="text-sm font-medium">{room.name}</span>
                            {room.isPinned && <Pin className="h-3 w-3" />}
                            {room.isWhatsApp && (
                              <Badge variant="outline" className="text-xs bg-green-50">
                                WA
                              </Badge>
                            )}
                          </div>
                          {room.unread > 0 && (
                            <Badge variant="destructive" className="h-5 min-w-5 text-xs">
                              {room.unread}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Chat Bots */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>CHAT BOTS</span>
                      </div>
                      {rooms
                        .filter(room => room.isBot)
                        .filter(room => 
                          searchQuery === '' || 
                          room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          room.description?.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((room) => (
                        <div
                          key={room.id}
                          className={`flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                            selectedRoom === room.id ? 'bg-blue-100 text-blue-700' : ''
                          }`}
                          onClick={() => {
                            setSelectedRoom(room.id);
                            setSelectedWhatsappNumber(null);
                          }}
                        >
                          <div className="flex items-center space-x-2 flex-1">
                            <Bot className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium">{room.name}</span>
                            <Badge variant="outline" className="text-xs bg-purple-50">
                              AI
                            </Badge>
                          </div>
                          {room.unread > 0 && (
                            <Badge variant="destructive" className="h-5 min-w-5 text-xs">
                              {room.unread}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Agents */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>AGENTS</span>
                        <Badge variant="outline" className="text-xs">
                          {agents.filter(a => a.status === 'online' || a.status === 'busy').length} online
                        </Badge>
                      </div>
                      {agents
                        .filter(agent => 
                          searchQuery === '' || 
                          agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          agent.role.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((agent) => (
                        <div
                          key={agent.id}
                          className="flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-muted/50"
                        >
                          <Avatar className="h-8 w-8 mr-2">
                            <AvatarImage src={agent.avatar} />
                            <AvatarFallback className="text-xs">
                              {agent.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium truncate">{agent.name}</span>
                              <div className={`h-2 w-2 rounded-full ${
                                agent.status === 'online' ? 'bg-green-500' : 
                                agent.status === 'away' ? 'bg-yellow-500' :
                                agent.status === 'busy' ? 'bg-red-500' :
                                'bg-gray-400'
                              }`} />
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {agent.role} · {agent.activeChats} active
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            ★ {agent.rating}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    {/* Direct Messages */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>DIRECT MESSAGES</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      {directMessages
                        .filter(dm => 
                          searchQuery === '' || 
                          dm.name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((dm) => (
                        <div
                          key={dm.id}
                          className="flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-muted/50"
                        >
                          <Avatar className="h-6 w-6 mr-2">
                            <AvatarImage src={dm.avatar} />
                            <AvatarFallback className="text-xs">
                              {dm.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center space-x-1">
                              <span className="text-sm font-medium">{dm.name}</span>
                              <div className={`h-2 w-2 rounded-full ${
                                dm.status === 'online' ? 'bg-green-500' : 
                                dm.status === 'away' ? 'bg-yellow-500' : 'bg-gray-400'
                              }`} />
                            </div>
                          </div>
                          {dm.unread > 0 && (
                            <Badge variant="destructive" className="h-5 min-w-5 text-xs">
                              {dm.unread}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </ScrollArea>
              </div>

              {/* Chat Area */}
              <div className="flex-1 flex flex-col">
                {/* Chat Header */}
                <div className="p-4 border-b bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {currentRoom?.isPrivate ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
                      <div>
                        <h3 className="font-semibold">{currentRoom?.name ?? 'General'}</h3>
                        <p className="text-sm text-muted-foreground">
                          {currentRoom?.members?.toLocaleString?.() ?? 0} members  b7 {currentRoom?.description ?? 'General discussion and updates'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="ghost" size="sm">
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Video className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Info className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4 bg-slate-100 dark:bg-slate-800">
                  <div className="space-y-4">
                    {selectedWhatsappNumber ? (
                      whatsappMessages.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No messages in this conversation
                        </div>
                      ) : (
                        whatsappMessages.map((msg, idx) => (
                          <div key={idx} className={`flex space-x-3 ${msg.direction === 'outbound-api' ? 'flex-row-reverse' : ''}`}>
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={`text-xs ${msg.direction === 'outbound-api' ? 'bg-blue-500' : 'bg-green-500'} text-white`}>
                                <Smartphone className="h-4 w-4" />
                              </AvatarFallback>
                            </Avatar>
                            <div className={`flex-1 space-y-1 ${msg.direction === 'outbound-api' ? 'items-end' : ''}`}>
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-sm">
                                  {msg.direction === 'outbound-api' ? 'You' : msg.from}
                                </span>
                                <Badge variant={
                                  msg.status === 'delivered' ? 'default' :
                                  msg.status === 'sent' ? 'secondary' :
                                  msg.status === 'failed' ? 'destructive' : 'outline'
                                } className="text-xs">
                                  {msg.status}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <div className={`inline-block rounded-lg px-3 py-2 ${
                                msg.direction === 'outbound-api' 
                                  ? 'bg-blue-500 text-white' 
                                  : 'bg-muted'
                              }`}>
                                <p className="text-sm">{msg.body}</p>
                              </div>
                              {msg.errorCode && (
                                <p className="text-xs text-red-500">Error: {msg.errorCode}</p>
                              )}
                            </div>
                          </div>
                        ))
                      )
                    ) : roomMessages.length === 0 ? (
                      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                        No messages in this room yet
                      </div>
                    ) : (
                      roomMessages.map((message) => (
                        <div key={message.id} className={`flex space-x-3 p-3 rounded-lg shadow-sm ${message.isWhatsApp ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800' : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600'}`}>
                          <Avatar className="h-10 w-10 ring-2 ring-offset-2 ${message.isWhatsApp ? 'ring-green-400' : 'ring-blue-400'}">
                            <AvatarImage src={message.avatar} />
                            <AvatarFallback className={`text-xs font-semibold ${message.isWhatsApp ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
                              {message.isBot ? <Bot className="h-4 w-4" /> : 
                               message.isWhatsApp ? <Smartphone className="h-4 w-4" /> :
                               message.sender?.split(' ').map((n: string) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{message.sender}</span>
                              {message.isBot && <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">BOT</Badge>}
                              {message.isWhatsApp && <Badge className="text-xs bg-green-500 text-white">WhatsApp</Badge>}
                              <span className="text-xs text-slate-500 dark:text-slate-400">{message.timestamp}</span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{message.content}</p>
                            {message.reactions && message.reactions.length > 0 && (
                              <div className="flex space-x-1">
                                {message.reactions.map((reaction: any, idx: number) => (
                                  <Button
                                    key={idx}
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                  >
                                    {reaction.emoji} {reaction.count}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Typing Indicator for Bot */}
                  {isBotTyping && (
                    <div className="flex items-center space-x-2 px-4 py-2">
                      <Bot className="h-5 w-5 text-purple-600 animate-pulse" />
                      <div className="flex space-x-1">
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                      <span className="text-xs text-purple-600">AI is typing...</span>
                    </div>
                  )}
                </ScrollArea>

                {/* Message Input */}
                <div className="p-4 border-t bg-white dark:bg-slate-800 shadow-lg">
                  {selectedWhatsappNumber ? (
                    <div className="flex space-x-2">
                      <div className="flex-1 relative">
                        <Input
                          placeholder={`WhatsApp message to ${selectedWhatsappNumber}...`}
                          value={whatsappMessage}
                          onChange={(e) => setWhatsappMessage(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSendWhatsAppMessage()}
                        />
                      </div>
                      <Button onClick={handleSendWhatsAppMessage} className="bg-green-600 hover:bg-green-700">
                        <Smartphone className="h-4 w-4 mr-2" />
                        Send via WhatsApp
                      </Button>
                    </div>
                  ) : (
                    <div className="flex space-x-2">
                      <div className="flex-1 relative">
                        <Input
                          placeholder={`Message #${currentRoom?.name ?? 'general'}`}
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                          className="pr-32"
                        />
                        <div className="absolute right-2 top-2 flex space-x-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Paperclip className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Smile className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <AtSign className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <Button onClick={handleSendMessage}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* WhatsApp Tab */}
          <TabsContent value="whatsapp" className="space-y-6">
            <WhatsAppMessaging />
          </TabsContent>

          {/* Support Tickets Tab */}
          <TabsContent value="tickets" className="space-y-6">
            <div className="grid gap-6">
              {/* Tickets Stats */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <h3 className="tracking-tight text-sm font-medium">Total Tickets</h3>
                      <Ticket className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">{ticketStats.total}</div>
                      <p className="text-xs text-muted-foreground">
                        {ticketStats.chatRelated} chat-related
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <h3 className="tracking-tight text-sm font-medium">Open Tickets</h3>
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold text-red-600">{ticketStats.open}</div>
                      <p className="text-xs text-muted-foreground">
                        {ticketStats.inProgress} in progress
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <h3 className="tracking-tight text-sm font-medium">Response Time</h3>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">{ticketStats.avgResponseTime}</div>
                      <p className="text-xs text-muted-foreground">Average response time</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <h3 className="tracking-tight text-sm font-medium">Critical Issues</h3>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-bold text-red-600">{ticketStats.priorityDistribution.critical}</div>
                      <p className="text-xs text-muted-foreground">Requiring immediate attention</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Active Tickets List */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Active Support Tickets</CardTitle>
                        <Button size="sm" onClick={() => window.open('/admin/tickets', '_blank')}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open Full Ticket Manager
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {supportTickets.filter(t => t.status !== 'resolved').map((ticket) => (
                          <div key={ticket.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <div className={`h-3 w-3 rounded-full ${
                                    ticket.priority === 'critical' ? 'bg-red-500' :
                                    ticket.priority === 'high' ? 'bg-orange-500' :
                                    ticket.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                                  }`} />
                                  <Badge variant={
                                    ticket.status === 'open' ? 'destructive' :
                                    ticket.status === 'in-progress' ? 'default' : 'secondary'
                                  }>
                                    {ticket.status.replace('-', ' ')}
                                  </Badge>
                                  <span className="text-sm font-mono text-muted-foreground">{ticket.id}</span>
                                </div>
                                <h4 className="font-semibold mb-1">{ticket.title}</h4>
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {ticket.description}
                                </p>
                                <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center">
                                    <Hash className="h-3 w-3 mr-1" />
                                    {ticket.channel}
                                  </span>
                                  <span className="flex items-center">
                                    <MessageSquare className="h-3 w-3 mr-1" />
                                    {ticket.relatedMessages} messages
                                  </span>
                                  <span>{ticket.requester.name}</span>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" onClick={() => window.open(`/admin/tickets/${ticket.id}`, '_blank')}>
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-muted-foreground">
                                {ticket.assignee ? `Assigned to ${ticket.assignee.name}` : 'Unassigned'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(ticket.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Card>
                    <CardHeader>
                      <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button className="w-full" onClick={() => window.open('/admin/tickets', '_blank')}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Ticket
                      </Button>
                      <Button variant="outline" className="w-full">
                        <Search className="mr-2 h-4 w-4" />
                        Search Tickets
                      </Button>
                      <Button variant="outline" className="w-full" onClick={() => setActiveTab('analytics')}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        View Analytics
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle>Chat-Related Issues</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>Message delivery issues:</span>
                          <Badge variant="destructive">3</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Bot response delays:</span>
                          <Badge variant="destructive">2</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Connection problems:</span>
                          <Badge variant="secondary">1</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Feature requests:</span>
                          <Badge variant="outline">6</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="mt-6">
                    <CardHeader>
                      <CardTitle>Integration Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>WhatsApp Integration:</span>
                          <div className="flex items-center">
                            <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-green-600">Active</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Email Notifications:</span>
                          <div className="flex items-center">
                            <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-green-600">Active</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>SMS Alerts:</span>
                          <div className="flex items-center">
                            <Clock className="h-4 w-4 text-yellow-500 mr-1" />
                            <span className="text-yellow-600">Pending</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Voice Calls:</span>
                          <div className="flex items-center">
                            <XCircle className="h-4 w-4 text-red-500 mr-1" />
                            <span className="text-red-600">Issues</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Rooms & Channels Tab */}
          <TabsContent value="rooms" className="space-y-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Channel Management</CardTitle>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="mr-2 h-4 w-4" />
                          Create Channel
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create New Channel</DialogTitle>
                          <DialogDescription>
                            Create a new channel for team communication
                          </DialogDescription>
                        </DialogHeader>
                        <CreateChannelForm onSubmit={handleCreateRoom} />
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {rooms.map((room) => (
                      <div key={room.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          {room.isPrivate ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
                          <div>
                            <h4 className="font-medium">{room.name}</h4>
                            <p className="text-sm text-muted-foreground">{room.description}</p>
                            <div className="flex items-center space-x-4 mt-1 text-xs text-muted-foreground">
                              <span>{room.members.toLocaleString()} members</span>
                              <span>Last activity: {room.lastActivity}</span>
                              {room.isPinned && <Badge variant="secondary">Pinned</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Chat Bots Tab */}
          <TabsContent value="bots" className="space-y-6">
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-3">
                {chatBots.map((bot) => (
                  <Card key={bot.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Bot className="h-5 w-5 text-blue-600" />
                          <CardTitle className="text-lg">{bot.name}</CardTitle>
                        </div>
                        <Badge variant={bot.status === 'active' ? 'default' : 'secondary'}>
                          {bot.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">{bot.description}</p>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Interactions:</span>
                          <span className="font-medium">{bot.interactions.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Accuracy:</span>
                          <span className="font-medium">{bot.accuracy}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Response Time:</span>
                          <span className="font-medium">{bot.responseTime}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h5 className="text-sm font-medium">Active in Channels:</h5>
                        <div className="flex flex-wrap gap-1">
                          {bot.channels.map((channel) => (
                            <Badge key={channel} variant="outline" className="text-xs">
                              #{channel}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" className="flex-1">
                              <Settings className="mr-1 h-3 w-3" />
                              Configure
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Configure {bot.name}</DialogTitle>
                              <DialogDescription>
                                Comprehensive AI bot configuration - settings, integrations, and behavior
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6">
                              {/* Basic Settings */}
                              <div className="space-y-4 border-b pb-4">
                                <h3 className="text-lg font-semibold">Basic Settings</h3>
                                
                                <div className="space-y-2">
                                  <Label>Bot Status</Label>
                                  <div className="flex items-center space-x-2">
                                    <Button 
                                      variant={bot.status === 'active' ? 'default' : 'outline'}
                                      size="sm"
                                      onClick={() => {
                                        setChatBots(prev => prev.map(b => 
                                          b.id === bot.id ? {...b, status: 'active'} : b
                                        ));
                                      }}
                                    >
                                      Active
                                    </Button>
                                    <Button 
                                      variant={bot.status === 'inactive' ? 'default' : 'outline'}
                                      size="sm"
                                      onClick={() => {
                                        setChatBots(prev => prev.map(b => 
                                          b.id === bot.id ? {...b, status: 'inactive'} : b
                                        ));
                                      }}
                                    >
                                      Inactive
                                    </Button>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label htmlFor={`bot-name-${bot.id}`}>Bot Name</Label>
                                    <Input 
                                      id={`bot-name-${bot.id}`}
                                      value={bot.name}
                                      onChange={(e) => {
                                        setChatBots(prev => prev.map(b => 
                                          b.id === bot.id ? {...b, name: e.target.value} : b
                                        ));
                                      }}
                                    />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label htmlFor={`bot-id-${bot.id}`}>Bot ID</Label>
                                    <Input 
                                      id={`bot-id-${bot.id}`}
                                      value={bot.id}
                                      disabled
                                      className="bg-muted"
                                    />
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label htmlFor={`bot-desc-${bot.id}`}>Description</Label>
                                  <Textarea 
                                    id={`bot-desc-${bot.id}`}
                                    value={bot.description}
                                    onChange={(e) => {
                                      setChatBots(prev => prev.map(b => 
                                        b.id === bot.id ? {...b, description: e.target.value} : b
                                      ));
                                    }}
                                    rows={2}
                                  />
                                </div>
                              </div>

                              {/* AI Model Configuration */}
                              <div className="space-y-4 border-b pb-4">
                                <h3 className="text-lg font-semibold">AI Model Configuration</h3>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>AI Provider</Label>
                                    <select className="w-full border rounded-md px-3 py-2">
                                      <option>OpenAI GPT-4</option>
                                      <option>Google Gemini</option>
                                      <option>Anthropic Claude</option>
                                      <option>Custom Model</option>
                                    </select>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label>Model Version</Label>
                                    <select className="w-full border rounded-md px-3 py-2">
                                      <option>Latest</option>
                                      <option>gpt-4-turbo</option>
                                      <option>gpt-4</option>
                                      <option>gpt-3.5-turbo</option>
                                    </select>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-4">
                                  <div className="space-y-2">
                                    <Label>Temperature</Label>
                                    <Input type="number" step="0.1" min="0" max="2" defaultValue="0.7" />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label>Max Tokens</Label>
                                    <Input type="number" step="100" min="100" max="4000" defaultValue="2000" />
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label>Top P</Label>
                                    <Input type="number" step="0.1" min="0" max="1" defaultValue="0.9" />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>System Prompt</Label>
                                  <Textarea 
                                    placeholder="You are a helpful medical assistant..."
                                    rows={4}
                                    defaultValue="You are a professional healthcare AI assistant. Provide accurate medical information while being empathetic and clear. Always recommend consulting with healthcare providers for serious concerns."
                                  />
                                </div>
                              </div>

                              {/* Integrations */}
                              <div className="space-y-4 border-b pb-4">
                                <h3 className="text-lg font-semibold">Integrations</h3>
                                
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between p-3 border rounded-md">
                                    <div className="flex items-center space-x-3">
                                      <input type="checkbox" defaultChecked className="w-4 h-4" />
                                      <div>
                                        <p className="font-medium">Electronic Health Records (EHR)</p>
                                        <p className="text-sm text-muted-foreground">Access patient medical history</p>
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm">Configure</Button>
                                  </div>
                                  
                                  <div className="flex items-center justify-between p-3 border rounded-md">
                                    <div className="flex items-center space-x-3">
                                      <input type="checkbox" defaultChecked className="w-4 h-4" />
                                      <div>
                                        <p className="font-medium">Appointment System</p>
                                        <p className="text-sm text-muted-foreground">Book and manage appointments</p>
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm">Configure</Button>
                                  </div>
                                  
                                  <div className="flex items-center justify-between p-3 border rounded-md">
                                    <div className="flex items-center space-x-3">
                                      <input type="checkbox" className="w-4 h-4" />
                                      <div>
                                        <p className="font-medium">Pharmacy Integration</p>
                                        <p className="text-sm text-muted-foreground">Prescription and medication data</p>
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm">Configure</Button>
                                  </div>
                                  
                                  <div className="flex items-center justify-between p-3 border rounded-md">
                                    <div className="flex items-center space-x-3">
                                      <input type="checkbox" defaultChecked className="w-4 h-4" />
                                      <div>
                                        <p className="font-medium">Lab Results</p>
                                        <p className="text-sm text-muted-foreground">Access diagnostic and lab test results</p>
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm">Configure</Button>
                                  </div>
                                  
                                  <div className="flex items-center justify-between p-3 border rounded-md">
                                    <div className="flex items-center space-x-3">
                                      <input type="checkbox" className="w-4 h-4" />
                                      <div>
                                        <p className="font-medium">WhatsApp Business API</p>
                                        <p className="text-sm text-muted-foreground">Send messages via WhatsApp</p>
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm">Configure</Button>
                                  </div>
                                  
                                  <div className="flex items-center justify-between p-3 border rounded-md">
                                    <div className="flex items-center space-x-3">
                                      <input type="checkbox" className="w-4 h-4" />
                                      <div>
                                        <p className="font-medium">Email Notifications</p>
                                        <p className="text-sm text-muted-foreground">Send email alerts and summaries</p>
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm">Configure</Button>
                                  </div>
                                </div>
                              </div>

                              {/* Behavior Settings */}
                              <div className="space-y-4 border-b pb-4">
                                <h3 className="text-lg font-semibold">Behavior Settings</h3>
                                
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">Auto-respond to messages</p>
                                      <p className="text-sm text-muted-foreground">Automatically reply to user messages</p>
                                    </div>
                                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">Require human approval</p>
                                      <p className="text-sm text-muted-foreground">Agent must approve bot responses</p>
                                    </div>
                                    <input type="checkbox" className="w-4 h-4" />
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">Learning mode</p>
                                      <p className="text-sm text-muted-foreground">Bot learns from interactions</p>
                                    </div>
                                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">Escalate complex queries</p>
                                      <p className="text-sm text-muted-foreground">Transfer to human agent when needed</p>
                                    </div>
                                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Response Delay (seconds)</Label>
                                  <Input type="number" min="0" max="60" defaultValue="2" />
                                  <p className="text-sm text-muted-foreground">Simulate human typing time</p>
                                </div>
                                
                                <div className="space-y-2">
                                  <Label>Max Conversation Length</Label>
                                  <Input type="number" min="5" max="100" defaultValue="20" />
                                  <p className="text-sm text-muted-foreground">Maximum messages before escalation</p>
                                </div>
                              </div>

                              {/* Active Channels */}
                              <div className="space-y-4 border-b pb-4">
                                <h3 className="text-lg font-semibold">Active Channels</h3>
                                <div className="flex flex-wrap gap-2">
                                  {['general', 'support', 'doctors', 'emergency', 'patient-support'].map(channel => (
                                    <Badge 
                                      key={channel}
                                      variant={bot.channels.includes(channel) ? 'default' : 'outline'}
                                      className="cursor-pointer px-3 py-1"
                                      onClick={() => {
                                        setChatBots(prev => prev.map(b => {
                                          if (b.id === bot.id) {
                                            const channels = b.channels.includes(channel)
                                              ? b.channels.filter(c => c !== channel)
                                              : [...b.channels, channel];
                                            return {...b, channels};
                                          }
                                          return b;
                                        }));
                                      }}
                                    >
                                      #{channel}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              {/* Knowledge Base */}
                              <div className="space-y-4 border-b pb-4">
                                <h3 className="text-lg font-semibold">Knowledge Base</h3>
                                
                                <div className="space-y-2">
                                  <Label>Training Documents</Label>
                                  <div className="border rounded-md p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm">medical-guidelines.pdf</span>
                                      <Button variant="ghost" size="sm">Remove</Button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm">treatment-protocols.docx</span>
                                      <Button variant="ghost" size="sm">Remove</Button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm">faq-database.json</span>
                                      <Button variant="ghost" size="sm">Remove</Button>
                                    </div>
                                  </div>
                                  <Button variant="outline" size="sm" className="w-full">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Upload Documents
                                  </Button>
                                </div>
                              </div>

                              {/* Security & Compliance */}
                              <div className="space-y-4 pb-4">
                                <h3 className="text-lg font-semibold">Security & Compliance</h3>
                                
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">HIPAA Compliance Mode</p>
                                      <p className="text-sm text-muted-foreground">Ensure data handling meets HIPAA standards</p>
                                    </div>
                                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">Audit Logging</p>
                                      <p className="text-sm text-muted-foreground">Log all bot interactions</p>
                                    </div>
                                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium">Data Encryption</p>
                                      <p className="text-sm text-muted-foreground">Encrypt sensitive information</p>
                                    </div>
                                    <input type="checkbox" defaultChecked className="w-4 h-4" />
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex justify-end space-x-2 pt-4 border-t">
                                <Button variant="outline">Reset to Default</Button>
                                <Button variant="outline">Test Bot</Button>
                                <Button>Save Configuration</Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button size="sm" variant="outline">
                          <BarChart3 className="mr-1 h-3 w-3" />
                          Analytics
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Chat Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Enable Chat Bots</span>
                      <input 
                        type="checkbox" 
                        checked={chatBotEnabled}
                        onChange={(e) => setChatBotEnabled(e.target.checked)}
                        className="toggle"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">File Uploads</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Message History</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Push Notifications</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Security Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <Label>Message Retention (days)</Label>
                      <Select defaultValue="90">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 days</SelectItem>
                          <SelectItem value="90">90 days</SelectItem>
                          <SelectItem value="365">1 year</SelectItem>
                          <SelectItem value="forever">Forever</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Max File Size (MB)</Label>
                      <Input defaultValue="100" type="number" />
                    </div>
                    <div>
                      <Label>Allowed File Types</Label>
                      <Input defaultValue="jpg,png,pdf,doc,docx" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </LayoutComponent>
  );
}

// WhatsApp Messaging Component
function WhatsAppMessaging() {
  const { toast } = useToast();
  const [activeTemplate, setActiveTemplate] = useState('otp');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const sendingRef = useRef(false);
  const [messageSid, setMessageSid] = useState('');
  const [messageStatus, setMessageStatus] = useState<any>(null);
  
  // Template-specific fields
  const [otpCode, setOtpCode] = useState('');
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [location, setLocation] = useState('');
  const [medications, setMedications] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [prescriptionUrl, setPrescriptionUrl] = useState('');
  const [reportUrl, setReportUrl] = useState('');
  const [checkupUrl, setCheckupUrl] = useState('');

  const [recentMessages, setRecentMessages] = useState<any[]>([]);

  const templates = {
    otp: {
      name: 'OTP Verification',
      description: 'Send verification code',
      endpoint: '/whatsapp-production/send/otp',
      fields: ['phoneNumber', 'otp']
    },
    appointment_confirmation: {
      name: 'Appointment Confirmation',
      description: 'Confirm patient appointment',
      endpoint: '/whatsapp-production/send/appointment-confirmation',
      fields: ['phoneNumber', 'patientName', 'doctorOrLabName', 'date', 'time', 'location']
    },
    appointment_reminder: {
      name: 'Appointment Reminder',
      description: 'Remind about upcoming appointment',
      endpoint: '/whatsapp-production/send/appointment-reminder',
      fields: ['phoneNumber', 'patientName', 'doctorName', 'time', 'location']
    },
    prescription: {
      name: 'Prescription Ready',
      description: 'Notify prescription is available',
      endpoint: '/whatsapp-production/send/prescription',
      fields: ['phoneNumber', 'patientName', 'doctorName', 'prescriptionUrl', 'medications', 'followUpDate']
    },
    health_report: {
      name: 'Health Report Ready',
      description: 'Notify health report is available',
      endpoint: '/whatsapp-production/send/health-report',
      fields: ['phoneNumber', 'patientName', 'reportUrl']
    },
    checkup_reminder: {
      name: 'Health Checkup Reminder',
      description: 'Remind about annual checkup',
      endpoint: '/whatsapp-production/send/checkup-reminder',
      fields: ['phoneNumber', 'patientName', 'checkupUrl']
    }
  };

  const handleSendWhatsApp = async () => {
    if (sendingRef.current) return;
    if (!phoneNumber) {
      toast({
        title: 'Error',
        description: 'Please enter a phone number',
        variant: 'destructive'
      });
      return;
    }

    sendingRef.current = true;
    const template = templates[activeTemplate];
    const payload: Record<string, unknown> = { to: phoneNumber };

    // Build payload based on template
    switch (activeTemplate) {
      case 'otp':
        if (!otpCode) {
          toast({ title: 'Error', description: 'Please enter OTP code', variant: 'destructive' });
          return;
        }
        payload.otp = otpCode;
        break;
      case 'appointment_confirmation':
        payload.patientName = patientName;
        payload.doctorName = doctorName;
        payload.date = appointmentDate;
        payload.time = appointmentTime;
        payload.location = location;
        break;
      case 'appointment_reminder':
        payload.patientName = patientName;
        payload.doctorName = doctorName;
        payload.time = appointmentTime;
        payload.location = location;
        break;
      case 'prescription':
        payload.patientName = patientName;
        payload.doctorName = doctorName;
        payload.prescriptionUrl = prescriptionUrl;
        payload.medications = medications;
        payload.followUpDate = followUpDate;
        break;
      case 'health_report':
        payload.patientName = patientName;
        break;
      case 'checkup_reminder':
        payload.patientName = patientName;
        break;
    }

    try {
      setLoading(true);
      const { data } = await api.post(template.endpoint, payload);
      
      setMessageSid(data.data.messageSid);
      setRecentMessages(prev => [{
        sid: data.data.messageSid,
        to: phoneNumber,
        template: template.name,
        status: data.data.status,
        timestamp: new Date().toLocaleString()
      }, ...prev]);

      toast({
        title: 'Success',
        description: `WhatsApp message sent successfully! SID: ${data.data.messageSid}`
      });

      // Check status after 3 seconds
      setTimeout(() => checkMessageStatus(data.data.messageSid), 3000);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.message || 'Failed to send WhatsApp message',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const checkMessageStatus = async (sid: string) => {
    try {
      const { data } = await api.get(`/whatsapp-production/status/${sid}`);
      setMessageStatus(data.data);
      
      // Update recent messages
      setRecentMessages(prev => prev.map(msg => 
        msg.sid === sid ? { ...msg, status: data.data.status } : msg
      ));
    } catch (error) {
      console.error('Failed to check message status', error);
    }
  };

  const generateOTP = () => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setOtpCode(otp);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {/* Template Management Banner */}
        <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">WhatsApp Template Manager</p>
                <p className="text-xs text-muted-foreground">Create, edit, preview & submit templates for Meta approval</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={() => window.location.href = '/team/whatsapp-templates'}
            >
              <Plus className="h-3.5 w-3.5" />
              Manage Templates
              <ExternalLink className="h-3 w-3 ml-0.5" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Smartphone className="h-5 w-5" />
              <span>Send WhatsApp Message</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Template Selection */}
            <div>
              <Label>Message Template</Label>
              <Select value={activeTemplate} onValueChange={setActiveTemplate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(templates).map(([key, template]) => (
                    <SelectItem key={key} value={key}>
                      {template.name} - {template.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Phone Number */}
            <div>
              <Label>Phone Number</Label>
              <Input
                placeholder="+91XXXXXXXXXX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Include country code (e.g., +91 for India)</p>
            </div>

            {/* Template-specific fields */}
            {activeTemplate === 'otp' && (
              <div className="space-y-4">
                <div>
                  <Label>OTP Code</Label>
                  <div className="flex space-x-2">
                    <Input
                      placeholder="123456"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      maxLength={6}
                    />
                    <Button variant="outline" onClick={generateOTP}>
                      Generate
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {(activeTemplate === 'appointment_confirmation' || activeTemplate === 'appointment_reminder') && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Patient Name</Label>
                    <Input
                      placeholder="John Doe"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Doctor / Lab Name</Label>
                    <Input
                      placeholder="Dr. Smith or Medall Diagnostics"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                    />
                  </div>
                </div>
                {activeTemplate === 'appointment_confirmation' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Time</Label>
                      <Input
                        type="time"
                        value={appointmentTime}
                        onChange={(e) => setAppointmentTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {activeTemplate === 'appointment_reminder' && (
                  <div>
                    <Label>Time</Label>
                    <Input
                      placeholder="10:00 AM"
                      value={appointmentTime}
                      onChange={(e) => setAppointmentTime(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <Label>Location</Label>
                  <Input
                    placeholder="Mediczy Clinic, Main St"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>
            )}

            {activeTemplate === 'prescription' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Patient Name</Label>
                    <Input
                      placeholder="John Doe"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Doctor Name</Label>
                    <Input
                      placeholder="Dr. Smith"
                      value={doctorName}
                      onChange={(e) => setDoctorName(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Prescription URL</Label>
                  <Input
                    placeholder="https://mayden.in/prescription/123"
                    value={prescriptionUrl}
                    onChange={(e) => setPrescriptionUrl(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Medications</Label>
                  <Textarea
                    placeholder="Amoxicillin 500mg, Ibuprofen 200mg"
                    value={medications}
                    onChange={(e) => setMedications(e.target.value)}
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Follow-up Date</Label>
                  <Input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {(activeTemplate === 'health_report' || activeTemplate === 'checkup_reminder') && (
              <div className="space-y-4">
                <div>
                  <Label>Patient Name</Label>
                  <Input
                    placeholder="John Doe"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <Button onClick={handleSendWhatsApp} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send WhatsApp Message
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Messages */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Messages</CardTitle>
          </CardHeader>
          <CardContent>
            {recentMessages.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No messages sent yet</p>
            ) : (
              <div className="space-y-3">
                {recentMessages.map((msg, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant={
                          msg.status === 'delivered' ? 'default' :
                          msg.status === 'sent' ? 'secondary' :
                          msg.status === 'queued' ? 'outline' : 'destructive'
                        }>
                          {msg.status}
                        </Badge>
                        <span className="text-sm font-medium">{msg.template}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        To: {msg.to} • {msg.timestamp}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">
                        SID: {msg.sid}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => checkMessageStatus(msg.sid)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Connection:</span>
              <Badge variant="default">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Templates:</span>
              <Badge variant="default">6 Approved</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Messages Sent:</span>
              <span className="font-medium">{recentMessages.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setActiveTemplate('otp');
                generateOTP();
              }}
            >
              <Zap className="mr-2 h-4 w-4" />
              Send Test OTP
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setActiveTemplate('appointment_reminder')}
            >
              <Bell className="mr-2 h-4 w-4" />
              Send Reminder
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => window.location.href = '/team/whatsapp-templates'}
            >
              <Edit className="mr-2 h-4 w-4" />
              Create & Manage Templates
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => window.location.href = '/admin/whatsapp'}
            >
              <Settings className="mr-2 h-4 w-4" />
              Configure WhatsApp
            </Button>
          </CardContent>
        </Card>

        {messageStatus && (
          <Card>
            <CardHeader>
              <CardTitle>Last Message Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Status:</span>
                <Badge variant={
                  messageStatus.status === 'delivered' ? 'default' :
                  messageStatus.status === 'sent' ? 'secondary' : 'outline'
                }>
                  {messageStatus.status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>To:</span>
                <span className="font-mono text-xs">{messageStatus.to}</span>
              </div>
              {messageStatus.errorCode && (
                <div className="flex justify-between text-red-600">
                  <span>Error:</span>
                  <span>{messageStatus.errorCode}</span>
                </div>
              )}
              {messageStatus.price && (
                <div className="flex justify-between">
                  <span>Cost:</span>
                  <span>₹{(parseFloat(messageStatus.price) * 80).toFixed(2)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Template Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>OTP Verification:</span>
              <span className="font-medium">
                {recentMessages.filter(m => m.template === 'OTP Verification').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Appointments:</span>
              <span className="font-medium">
                {recentMessages.filter(m => m.template.includes('Appointment')).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Prescriptions:</span>
              <span className="font-medium">
                {recentMessages.filter(m => m.template === 'Prescription Ready').length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Create Channel Form Component
function CreateChannelForm({ onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    private: false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ name: '', description: '', private: false });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Channel Name</Label>
        <Input
          placeholder="general"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          required
        />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea
          placeholder="Channel description..."
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
        />
      </div>
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="private"
          checked={formData.private}
          onChange={(e) => setFormData(prev => ({ ...prev, private: e.target.checked }))}
        />
        <Label htmlFor="private">Private Channel</Label>
      </div>
      <DialogFooter>
        <Button type="submit">
          Create Channel
        </Button>
      </DialogFooter>
    </form>
  );
}
