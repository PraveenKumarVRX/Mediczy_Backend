import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import api from '@/utils/api';
import { 
  MessageCircle, 
  Users, 
  Clock, 
  Search, 
  Filter,
  TrendingUp,
  Activity,
  MessageSquare,
  UserCheck,
  Timer,
  Send,
  Eye,
  AlertCircle,
  Info,
  Megaphone,
  RefreshCw,
  Calendar,
  BarChart3,
  PieChart
} from 'lucide-react';

interface DashboardOverview {
  totalRooms: number;
  totalMessages: number;
  activeUsers: number;
  onlineTeamMembers: number;
  recentActivity: {
    last24h: {
      messages: number;
      newRooms: number;
    };
  };
  analytics: {
    averageResponseTime: number;
    responseTimeUnit: string;
  };
}

interface Conversation {
  id: string;
  type: 'user_team' | 'team_internal';
  title: string;
  description: string;
  participants: Array<{
    id: string;
    name: string;
    role: string;
    isOnline: boolean;
  }>;
  messageCount: number;
  totalMessages?: number;
  lastMessage: {
    content: string;
    sender: string;
    timestamp: string;
    type: string;
  } | null;
  lastActivity: string;
  createdAt: string;
}

interface Message {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  message: string;
  type: string;
  timestamp: string;
  edited: boolean;
}

interface Analytics {
  period: string;
  messageVolume: Array<{ date: string; count: number }>;
  conversationTypes: { user_team: number; team_internal: number };
  teamPerformance: {
    topPerformers: Array<{
      userId: string;
      name: string;
      role: string;
      messageCount: number;
      conversationsHandled: number;
    }>;
    responseTimesByRole: Record<string, { average: number; count: number }>;
    overallAvgResponseTime: number;
  };
  timePatterns: {
    busyHours: Array<{ hour: number; count: number }>;
  };
  summary: {
    totalMessages: number;
    totalConversations: number;
    avgResponseTime: number;
    responseTimeUnit: string;
  };
}

const ChatDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  
  // Filters and pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Broadcast
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState('announcement');
  const [broadcastTargetRooms, setBroadcastTargetRooms] = useState<string[]>([]);
  
  // Analytics period
  const [analyticsPeriod, setAnalyticsPeriod] = useState('7d');
  
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadOverview();
    loadConversations();
    loadAnalytics();
    
    // Set up auto-refresh every 30 seconds
    refreshInterval.current = setInterval(() => {
      loadOverview();
      loadConversations();
    }, 30000);
    
    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    loadConversations();
  }, [searchQuery, typeFilter, statusFilter, currentPage]);

  useEffect(() => {
    loadAnalytics();
  }, [analyticsPeriod]);

  const loadOverview = async () => {
    try {
      const response = await api.get('/chat/dashboard/overview');
      setOverview(response.data?.overview ?? null);
    } catch (error) {
      console.error('Error loading overview:', error);
      toast.error('Failed to load overview data');
    }
  };

  const loadConversations = async () => {
    setLoading(true);
    try {
      const response = await api.get('/chat/dashboard/conversations', {
        params: {
          page: currentPage,
          limit: 20,
          type: typeFilter,
          status: statusFilter,
          search: searchQuery,
        },
      });

      setConversations(response.data?.conversations ?? []);
      setTotalPages(response.data?.pagination?.totalPages ?? 1);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const loadConversationDetails = async (conversationId: string) => {
    try {
      const response = await api.get(`/chat/dashboard/conversation/${conversationId}`);
      setSelectedConversation(response.data?.conversation ?? null);
      setConversationMessages(response.data?.messages ?? []);
    } catch (error) {
      console.error('Error loading conversation details:', error);
      toast.error('Failed to load conversation details');
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await api.get('/chat/dashboard/analytics', {
        params: { period: analyticsPeriod },
      });
      setAnalytics(response.data?.analytics ?? null);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadOverview(),
      loadConversations(),
      loadAnalytics()
    ]);
    setRefreshing(false);
    toast.success('Dashboard refreshed');
  };

  const sendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      toast.error('Please enter a message to broadcast');
      return;
    }

    try {
      const response = await api.post('/chat/dashboard/broadcast', {
        message: broadcastMessage,
        type: broadcastType,
        targetRooms: broadcastTargetRooms.length > 0 ? broadcastTargetRooms : undefined,
      });

      toast.success(`Broadcast sent to ${response.data?.broadcastCount ?? 0} conversations`);
      setBroadcastMessage('');
      setBroadcastTargetRooms([]);
    } catch (error) {
      console.error('Error sending broadcast:', error);
      toast.error('Failed to send broadcast');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return `${hours}h ${remainingMinutes}m`;
  };

  const getConversationTypeIcon = (type: string) => {
    return type === 'user_team' ? <Users className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;
  };

  const getConversationTypeBadge = (type: string) => {
    return type === 'user_team' ? 'User Support' : 'Team Internal';
  };

  const getBroadcastIcon = (type: string) => {
    switch (type) {
      case 'announcement': return <Megaphone className="h-4 w-4" />;
      case 'warning': return <AlertCircle className="h-4 w-4" />;
      case 'info': return <Info className="h-4 w-4" />;
      default: return <Megaphone className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chat Dashboard</h1>
          <p className="text-gray-600">Monitor and manage all team conversations</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {overview && (
            <>
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <MessageCircle className="h-8 w-8 text-blue-500" />
                      <div>
                        <p className="text-sm text-gray-600">Total Conversations</p>
                        <p className="text-2xl font-bold">{overview.totalRooms}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="text-sm text-gray-600">Total Messages</p>
                        <p className="text-2xl font-bold">{overview.totalMessages}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Users className="h-8 w-8 text-purple-500" />
                      <div>
                        <p className="text-sm text-gray-600">Active Users</p>
                        <p className="text-2xl font-bold">{overview.activeUsers}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="h-8 w-8 text-orange-500" />
                      <div>
                        <p className="text-sm text-gray-600">Online Team</p>
                        <p className="text-2xl font-bold">{overview.onlineTeamMembers}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity & Response Time */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Activity className="h-5 w-5" />
                      <span>Recent Activity (24h)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-gray-600">New Messages</span>
                        <span className="font-semibold text-green-600">
                          +{overview.recentActivity.last24h.messages}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">New Conversations</span>
                        <span className="font-semibold text-blue-600">
                          +{overview.recentActivity.last24h.newRooms}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Timer className="h-5 w-5" />
                      <span>Response Performance</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-blue-600">
                          {formatDuration(overview.analytics.averageResponseTime)}
                        </p>
                        <p className="text-sm text-gray-600">Average Response Time</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* Conversations Tab */}
        <TabsContent value="conversations" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-64">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                    <Input
                      placeholder="Search conversations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Conversation type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="user_team">User Support</SelectItem>
                    <SelectItem value="team_internal">Team Internal</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Conversations List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Conversations</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  {loading ? (
                    <div className="flex items-center justify-center h-32">
                      <RefreshCw className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {conversations.map((conversation) => (
                        <div
                          key={conversation.id}
                          className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                            selectedConversation?.id === conversation.id ? 'ring-2 ring-blue-500' : ''
                          }`}
                          onClick={() => loadConversationDetails(conversation.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                {getConversationTypeIcon(conversation.type)}
                                <h4 className="font-medium text-sm">{conversation.title}</h4>
                                <Badge variant="secondary" className="text-xs">
                                  {getConversationTypeBadge(conversation.type)}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">{conversation.description}</p>
                              {conversation.lastMessage && (
                                <div className="mt-2">
                                  <p className="text-xs text-gray-800 truncate">
                                    <span className="font-medium">{conversation.lastMessage.sender}:</span>{' '}
                                    {conversation.lastMessage.content}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {formatTimestamp(conversation.lastMessage.timestamp)}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className="text-xs">
                                {conversation.messageCount} msgs
                              </Badge>
                              <div className="flex items-center space-x-1 mt-1">
                                {conversation.participants.slice(0, 3).map((participant, idx) => (
                                  <div key={idx} className="relative">
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback className="text-xs">
                                        {participant.name.substring(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    {participant.isOnline && (
                                      <div className="absolute -bottom-1 -right-1 h-2 w-2 bg-green-500 rounded-full border border-white"></div>
                                    )}
                                  </div>
                                ))}
                                {conversation.participants.length > 3 && (
                                  <span className="text-xs text-gray-500">+{conversation.participants.length - 3}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center mt-4">
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(currentPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Conversation Details */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedConversation ? (
                    <div className="flex items-center space-x-2">
                      <Eye className="h-5 w-5" />
                      <span>{selectedConversation.title}</span>
                    </div>
                  ) : (
                    'Select a conversation to view details'
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedConversation ? (
                  <div>
                    {/* Conversation Info */}
                    <div className="space-y-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-600">Participants:</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedConversation.participants.map((participant) => (
                            <Badge key={participant.id} variant="outline" className="text-xs">
                              <div className="flex items-center space-x-1">
                                <span>{participant.name}</span>
                                <span className="text-gray-500">({participant.role})</span>
                                {participant.isOnline && <div className="h-2 w-2 bg-green-500 rounded-full"></div>}
                              </div>
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Messages:</span>
                          <span className="ml-2 font-medium">{selectedConversation.totalMessages || selectedConversation.messageCount}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Created:</span>
                          <span className="ml-2 font-medium">{formatTimestamp(selectedConversation.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Messages */}
                    <ScrollArea className="h-64 mt-4">
                      <div className="space-y-3">
                        {conversationMessages.map((message) => (
                          <div key={message.id} className="flex space-x-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {message.userName.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium text-sm">{message.userName}</span>
                                <Badge variant="secondary" className="text-xs">{message.userRole}</Badge>
                                <span className="text-xs text-gray-500">{formatTimestamp(message.timestamp)}</span>
                              </div>
                              <p className="text-sm mt-1 break-words">{message.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-12">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>Select a conversation from the list to view details</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Chat Analytics</h3>
            <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {analytics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Summary Cards */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <BarChart3 className="h-5 w-5" />
                    <span>Summary</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Messages</p>
                        <p className="text-2xl font-bold">{analytics.summary.totalMessages}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Conversations</p>
                        <p className="text-2xl font-bold">{analytics.summary.totalConversations}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Avg Response Time</p>
                      <p className="text-xl font-bold text-blue-600">
                        {formatDuration(analytics.summary.avgResponseTime)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Conversation Types */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <PieChart className="h-5 w-5" />
                    <span>Conversation Types</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">User Support</span>
                      <Badge variant="outline">{analytics.conversationTypes.user_team}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Team Internal</span>
                      <Badge variant="outline">{analytics.conversationTypes.team_internal}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Top Performers */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Top Performing Team Members</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analytics.teamPerformance.topPerformers.map((performer) => (
                      <div key={performer.userId} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarFallback>{performer.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{performer.name}</p>
                            <Badge variant="secondary" className="text-xs">{performer.role}</Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{performer.conversationsHandled} conversations</p>
                          <p className="text-xs text-gray-600">{performer.messageCount} messages</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Broadcast Tab */}
        <TabsContent value="broadcast" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Megaphone className="h-5 w-5" />
                <span>Broadcast Message</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Message Type</label>
                    <Select value={broadcastType} onValueChange={setBroadcastType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="announcement">
                          <div className="flex items-center space-x-2">
                            <Megaphone className="h-4 w-4" />
                            <span>Announcement</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="warning">
                          <div className="flex items-center space-x-2">
                            <AlertCircle className="h-4 w-4" />
                            <span>Warning</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="info">
                          <div className="flex items-center space-x-2">
                            <Info className="h-4 w-4" />
                            <span>Information</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Target</label>
                    <Select value={broadcastTargetRooms.length > 0 ? 'selected' : 'all'}>
                      <SelectTrigger>
                        <SelectValue placeholder="All conversations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All conversations</SelectItem>
                        <SelectItem value="selected">Selected conversations</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Message</label>
                  <Textarea
                    placeholder="Enter your broadcast message..."
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    rows={4}
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setBroadcastMessage('');
                      setBroadcastTargetRooms([]);
                    }}
                  >
                    Clear
                  </Button>
                  <Button onClick={sendBroadcast}>
                    <Send className="h-4 w-4 mr-2" />
                    Send Broadcast
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ChatDashboard;