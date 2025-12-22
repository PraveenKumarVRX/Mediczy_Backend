import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import StatCard from './StatCard';
import {
  MessageCircle,
  Users,
  Clock,
  UserCheck,
  Video,
  Phone,
  TrendingUp,
  Search,
  Filter,
  MoreVertical,
  Send,
  Settings,
  Bell,
  Star,
  Archive,
  Trash2,
  Download,
  Eye
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface ChatUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: string;
  role: 'patient' | 'doctor' | 'admin' | 'support';
  messagesCount: number;
}

interface ChatConversation {
  id: string;
  participants: ChatUser[];
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  type: 'direct' | 'group' | 'support';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'archived' | 'closed';
}

const SimpleChatDashboard = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTab, setSelectedTab] = useState('overview');

  // Mock data - replace with real API calls
  const [stats, setStats] = useState({
    totalConversations: 1247,
    activeUsers: 89,
    messagesToday: 2156,
    teamOnline: 12,
    avgResponseTime: '2.3m',
    resolutionRate: 94.2
  });

  const [conversations, setConversations] = useState<ChatConversation[]>([
    {
      id: '1',
      participants: [
        { id: '1', name: 'Dr. Sarah Johnson', email: 'sarah.johnson@mediczy.com', isOnline: true, role: 'doctor', messagesCount: 45 },
        { id: '2', name: 'John Doe', email: 'john.doe@email.com', isOnline: false, lastSeen: '5m ago', role: 'patient', messagesCount: 12 }
      ],
      lastMessage: 'Thank you for the consultation, I feel much better now.',
      lastMessageTime: '2m ago',
      unreadCount: 0,
      type: 'direct',
      priority: 'low',
      status: 'active'
    },
    {
      id: '2',
      participants: [
        { id: '3', name: 'Support Team', email: 'support@mediczy.com', isOnline: true, role: 'support', messagesCount: 234 },
        { id: '4', name: 'Maria Garcia', email: 'maria.garcia@email.com', isOnline: true, role: 'patient', messagesCount: 8 }
      ],
      lastMessage: 'I need help with my appointment booking',
      lastMessageTime: '15m ago',
      unreadCount: 3,
      type: 'support',
      priority: 'high',
      status: 'active'
    }
  ]);

  const [activeUsers, setActiveUsers] = useState<ChatUser[]>([
    { id: '1', name: 'Dr. Sarah Johnson', email: 'sarah.johnson@mediczy.com', isOnline: true, role: 'doctor', messagesCount: 45 },
    { id: '3', name: 'Support Team', email: 'support@mediczy.com', isOnline: true, role: 'support', messagesCount: 234 },
    { id: '4', name: 'Maria Garcia', email: 'maria.garcia@email.com', isOnline: true, role: 'patient', messagesCount: 8 }
  ]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-green-500';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'doctor': return 'bg-blue-100 text-blue-800';
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'support': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.participants.some(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <div className="space-y-6">
      {/* Enhanced Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Conversations"
          value={stats.totalConversations}
          icon={MessageCircle}
          color="blue"
          trend={{ value: '+12.5%', isPositive: true }}
        />
        <StatCard
          title="Active Users"
          value={stats.activeUsers}
          icon={UserCheck}
          color="green"
          trend={{ value: '+8.2%', isPositive: true }}
        />
        <StatCard
          title="Messages Today"
          value={stats.messagesToday}
          icon={Send}
          color="purple"
          trend={{ value: '+24.1%', isPositive: true }}
        />
        <StatCard
          title="Team Online"
          value={stats.teamOnline}
          icon={Users}
          color="emerald"
          subtitle="of 15 total"
        />
        <StatCard
          title="Avg Response Time"
          value={stats.avgResponseTime}
          icon={Clock}
          color="amber"
          trend={{ value: '-15.3%', isPositive: true }}
        />
        <StatCard
          title="Resolution Rate"
          value={`${stats.resolutionRate}%`}
          icon={TrendingUp}
          color="rose"
          trend={{ value: '+2.1%', isPositive: true }}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
          <TabsList className="grid w-full lg:w-auto grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="users">Active Users</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Conversations */}
            <Card className="admin-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Recent Conversations
                </CardTitle>
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <div className="space-y-3">
                    {conversations.slice(0, 5).map((conv) => (
                      <div key={conv.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="relative">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {conv.participants[0].name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${getPriorityColor(conv.priority)}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm truncate">
                              {conv.participants.map(p => p.name).join(', ')}
                            </p>
                            <span className="text-xs text-muted-foreground">{conv.lastMessageTime}</span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className={getRoleColor(conv.participants[0].role)}>
                              {conv.participants[0].role}
                            </Badge>
                            {conv.unreadCount > 0 && (
                              <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                                {conv.unreadCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Active Team Members */}
            <Card className="admin-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Active Team Members
                </CardTitle>
                <Badge variant="outline">{activeUsers.length} online</Badge>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <div className="space-y-3">
                    {activeUsers.map((user) => (
                      <div key={user.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors">
                        <div className="relative">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {user.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          {user.isOnline && (
                            <div className="absolute -bottom-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{user.name}</p>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <Video className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <Phone className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className={getRoleColor(user.role)}>
                              {user.role}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {user.messagesCount} messages
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SimpleChatDashboard;